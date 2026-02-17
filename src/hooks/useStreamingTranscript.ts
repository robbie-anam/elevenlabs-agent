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
 *   - speechStartTime: wall-clock timestamp when the first audio chunk of the
 *     current speech turn arrives (set in handleAudioChunk).
 *   - cumulativeAudioOffset: total duration of PCM audio received so far in
 *     this speech turn, used to position each alignment block relative to the
 *     start of speech.
 *   - charStartTime: per-character offset within an alignment block, provided
 *     by ElevenLabs' onAudioAlignment callback.
 *   - RENDER_DELAY_MS: fixed offset to compensate for Anam's face rendering
 *     pipeline, so text appears when the avatar actually mouths the word.
 *
 * The hook schedules a setTimeout per character and batches DOM updates via
 * requestAnimationFrame to avoid excessive re-renders.
 */

/** Approximate delay for Anam's face rendering pipeline (ms) */
const RENDER_DELAY_MS = 500;

export function useStreamingTranscript() {
  const [messages, setMessages] = useState<Message[]>([]);

  // --- Streaming refs ---
  const speechStartTimeRef = useRef(0);
  const cumulativeAudioMsRef = useRef(0);
  const chunkAudioOffsetRef = useRef(0);
  const pendingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const streamingTextRef = useRef("");
  const fullAgentTextRef = useRef("");
  const agentMessageTextRef = useRef("");
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
    streamingTextRef.current = "";
    fullAgentTextRef.current = "";
    agentMessageTextRef.current = "";
    cumulativeAudioMsRef.current = 0;
    chunkAudioOffsetRef.current = 0;
    speechStartTimeRef.current = 0;
  }, []);

  const scheduleTextUpdate = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const text = streamingTextRef.current;
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
  }, []);

  const finalizeAgentMessage = useCallback(() => {
    clearPendingTimers();
    const finalText =
      agentMessageTextRef.current ||
      fullAgentTextRef.current ||
      streamingTextRef.current;
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

  const handleAudioChunk = useCallback((base64Audio: string) => {
    if (cumulativeAudioMsRef.current === 0) {
      speechStartTimeRef.current = Date.now();
    }
    chunkAudioOffsetRef.current = cumulativeAudioMsRef.current;

    // PCM 16-bit mono @ 16 kHz → duration
    const paddingMatch = base64Audio.match(/=+$/);
    const padding = paddingMatch ? paddingMatch[0].length : 0;
    const bytes = (base64Audio.length * 3) / 4 - padding;
    const durationMs = (bytes / 2 / 16000) * 1000;
    cumulativeAudioMsRef.current += durationMs;
  }, []);

  const handleAlignment = useCallback(
    ({
      chars,
      char_start_times_ms,
    }: {
      chars: string[];
      char_start_times_ms: number[];
      char_durations_ms: number[];
    }) => {
      const baseTime = speechStartTimeRef.current;
      const audioOffset = chunkAudioOffsetRef.current;
      const now = Date.now();

      for (let i = 0; i < chars.length; i++) {
        fullAgentTextRef.current += chars[i];

        const revealAt =
          baseTime + audioOffset + char_start_times_ms[i] + RENDER_DELAY_MS;
        const delay = Math.max(0, revealAt - now);

        const timer = setTimeout(() => {
          streamingTextRef.current += chars[i];
          scheduleTextUpdate();
        }, delay);
        pendingTimersRef.current.push(timer);
      }
    },
    [scheduleTextUpdate]
  );

  const handleAgentMessage = useCallback(
    (message: string) => {
      agentMessageTextRef.current = message;
      if (message.length > streamingTextRef.current.length) {
        streamingTextRef.current = message;
        scheduleTextUpdate();
      }
    },
    [scheduleTextUpdate]
  );

  const handleAgentDone = useCallback(() => {
    finalizeAgentMessage();
  }, [finalizeAgentMessage]);

  const handleInterrupt = useCallback(() => {
    clearPendingTimers();
    const partialText = streamingTextRef.current;
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
  }, [clearPendingTimers, resetStreamingState]);

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
