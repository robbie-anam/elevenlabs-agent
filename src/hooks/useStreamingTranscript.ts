import { useRef, useState, useCallback } from "react";

export type Message = {
  role: "user" | "agent";
  text: string;
  interrupted?: boolean;
};

/**
 * Streaming transcript hook — reveals agent text character-by-character
 * in sync with the avatar's speech.
 *
 * Timing model:
 *   Each character is revealed at:
 *     speechStartTime + cumulativeAudioOffset + charStartTime + RENDER_DELAY_MS
 *
 *   - speechStartTime: wall-clock timestamp captured when the first alignment
 *     of the current speech turn arrives.
 *   - cumulativeAudioOffset: total duration of PCM audio received *before* this
 *     chunk, used to position each alignment block relative to the start of
 *     speech. Read from cumulativeAudioMsRef inside handleAlignment, which fires
 *     before handleAudioChunk for the same event (the ElevenLabs SDK calls
 *     onAudioAlignment before onAudio).
 *   - charStartTime: per-character offset within an alignment block, provided
 *     by ElevenLabs' onAudioAlignment callback.
 *   - RENDER_DELAY_MS: fixed offset to compensate for Anam's face rendering
 *     pipeline, so text appears when the avatar actually mouths the word.
 *
 * Text is revealed using index-based slicing rather than string concatenation.
 * A monotonically increasing `revealedIndexRef` tracks how many characters to
 * show, and the display text is always `source.slice(0, revealedIndex)`. This
 * guarantees text is always a correct prefix — even if timers fire out of order
 * or onMessage arrives before alignment data finishes streaming.
 *
 * The hook batches DOM updates via requestAnimationFrame to avoid excessive
 * re-renders.
 */

/** Approximate delay for Anam's face rendering pipeline (ms) */
const RENDER_DELAY_MS = 500;

export function useStreamingTranscript() {
  const [messages, setMessages] = useState<Message[]>([]);

  // --- Streaming refs ---
  const speechStartTimeRef = useRef(0);
  const cumulativeAudioMsRef = useRef(0);
  const pendingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Characters accumulated from alignment data (TTS-normalized text). */
  const fullAgentTextRef = useRef("");
  /** Complete agent message from onMessage (LLM ground truth). */
  const agentMessageTextRef = useRef("");
  /** How many characters to display — only moves forward. */
  const revealedIndexRef = useRef(0);
  /** Total characters received across all alignment blocks this turn. */
  const alignedCharCountRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const clearPendingTimers = useCallback(() => {
    for (const id of pendingTimersRef.current) {
      clearTimeout(id);
    }
    pendingTimersRef.current = [];
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const resetStreamingState = useCallback(() => {
    fullAgentTextRef.current = "";
    agentMessageTextRef.current = "";
    cumulativeAudioMsRef.current = 0;
    speechStartTimeRef.current = 0;
    revealedIndexRef.current = 0;
    alignedCharCountRef.current = 0;
  }, []);

  /** Build display text: prefer onMessage ground truth, fall back to alignment chars. */
  const getDisplayText = useCallback(() => {
    const source = agentMessageTextRef.current || fullAgentTextRef.current;
    return source.slice(0, revealedIndexRef.current);
  }, []);

  const scheduleTextUpdate = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const text = getDisplayText();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "agent" && !last.interrupted) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, text };
          return updated;
        }
        return [...prev, { role: "agent", text }];
      });
    });
  }, [getDisplayText]);

  const finalizeAgentMessage = useCallback(() => {
    clearPendingTimers();
    const finalText =
      agentMessageTextRef.current || fullAgentTextRef.current;
    if (finalText) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "agent" && !last.interrupted) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, text: finalText };
          return updated;
        }
        if (!last || last.role !== "agent") {
          return [...prev, { role: "agent", text: finalText }];
        }
        return prev;
      });
    }
    resetStreamingState();
  }, [clearPendingTimers, resetStreamingState]);

  // --- Public API ---

  const addUserMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "user", text }]);
  }, []);

  /**
   * Track cumulative audio duration for alignment timing.
   * Called from onAudio — fires AFTER onAudioAlignment for the same event,
   * so cumulativeAudioMsRef is only incremented after alignment has read it.
   */
  const handleAudioChunk = useCallback((base64Audio: string) => {
    // PCM 16-bit mono @ 16 kHz → duration
    const paddingMatch = base64Audio.match(/=+$/);
    const padding = paddingMatch ? paddingMatch[0].length : 0;
    const bytes = (base64Audio.length * 3) / 4 - padding;
    const durationMs = (bytes / 2 / 16000) * 1000;
    cumulativeAudioMsRef.current += durationMs;
  }, []);

  /**
   * Schedule character reveals timed to the avatar's speech.
   * Called from onAudioAlignment — fires BEFORE onAudio for the same event,
   * so cumulativeAudioMsRef holds the total audio duration *before* this chunk
   * (exactly the offset we need).
   *
   * Each timer sets revealedIndexRef to its character's position. Since the
   * index only moves forward, out-of-order timers and post-catch-up timers
   * are harmless no-ops.
   */
  const handleAlignment = useCallback(
    ({
      chars,
      char_start_times_ms,
    }: {
      chars: string[];
      char_start_times_ms: number[];
      char_durations_ms: number[];
    }) => {
      // Set speech start time on first alignment of the turn
      if (speechStartTimeRef.current === 0) {
        speechStartTimeRef.current = Date.now();
      }

      const baseTime = speechStartTimeRef.current;
      const audioOffset = cumulativeAudioMsRef.current;
      const now = Date.now();
      const startIndex = alignedCharCountRef.current;

      for (let i = 0; i < chars.length; i++) {
        fullAgentTextRef.current += chars[i];
        const charIndex = startIndex + i;

        const revealAt =
          baseTime + audioOffset + char_start_times_ms[i] + RENDER_DELAY_MS;
        const delay = Math.max(0, revealAt - now);

        const timer = setTimeout(() => {
          // Only advance forward — once caught up via onMessage, these are no-ops
          if (charIndex + 1 > revealedIndexRef.current) {
            revealedIndexRef.current = charIndex + 1;
            scheduleTextUpdate();
          }
        }, delay);
        pendingTimersRef.current.push(timer);
      }

      alignedCharCountRef.current += chars.length;
    },
    [scheduleTextUpdate]
  );

  /**
   * Handle the complete agent message text (ground truth from onMessage).
   * If alignment hasn't revealed all the text yet, jump to the end.
   * Future alignment timers are harmless — their charIndex will be less than
   * revealedIndexRef so they no-op.
   */
  const handleAgentMessage = useCallback(
    (message: string) => {
      agentMessageTextRef.current = message;
      if (message.length > revealedIndexRef.current) {
        clearPendingTimers();
        revealedIndexRef.current = message.length;
        scheduleTextUpdate();
      }
    },
    [clearPendingTimers, scheduleTextUpdate]
  );

  const handleAgentDone = useCallback(() => {
    finalizeAgentMessage();
  }, [finalizeAgentMessage]);

  const handleInterrupt = useCallback(() => {
    clearPendingTimers();
    const partialText = getDisplayText();
    resetStreamingState();

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "agent") {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: partialText || last.text,
          interrupted: true,
        };
        return updated;
      }
      if (partialText) {
        return [
          ...prev,
          { role: "agent", text: partialText, interrupted: true },
        ];
      }
      return prev;
    });
  }, [clearPendingTimers, getDisplayText, resetStreamingState]);

  const reset = useCallback(() => {
    setMessages([]);
    resetStreamingState();
    clearPendingTimers();
  }, [resetStreamingState, clearPendingTimers]);

  const cleanup = useCallback(() => {
    clearPendingTimers();
    resetStreamingState();
  }, [clearPendingTimers, resetStreamingState]);

  return {
    messages,
    setMessages,
    addUserMessage,
    handleAudioChunk,
    handleAlignment,
    handleAgentMessage,
    handleAgentDone,
    handleInterrupt,
    reset,
    cleanup,
  };
}
