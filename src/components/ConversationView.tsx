"use client";

import { useRef, useState, useCallback } from "react";
import { AnamEvent, createClient, type AnamClient } from "@anam-ai/js-sdk";
import { Conversation } from "@elevenlabs/client";
import type { Preset } from "@/app/page";

type Message = {
  role: "user" | "agent";
  text: string;
  interrupted?: boolean;
};
type Status = "idle" | "connecting" | "connected" | "error";

/** Approximate delay for Anam's face rendering pipeline (ms) */
const RENDER_DELAY_MS = 500;

export default function ConversationView({
  presets,
}: {
  presets: Preset[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const anamClientRef = useRef<AnamClient | null>(null);
  const audioInputStreamRef = useRef<ReturnType<
    AnamClient["createAgentAudioInputStream"]
  > | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const anamReadyRef = useRef(false);
  const audioBufferRef = useRef<string[]>([]);

  // Streaming transcript refs
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
    // Prefer the complete onMessage text (alignment data may be incomplete)
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

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setMessages([]);
    anamReadyRef.current = false;
    audioBufferRef.current = [];
    resetStreamingState();
    clearPendingTimers();

    try {
      const { avatarId, agentId } = presets[selectedIndex];

      // Fetch tokens in parallel
      const [anamRes, elRes] = await Promise.all([
        fetch("/api/anam-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarId }),
        }),
        fetch("/api/elevenlabs-signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        }),
      ]);

      if (!anamRes.ok) {
        const body = await anamRes.json();
        throw new Error(body.error ?? "Failed to get Anam session token");
      }
      if (!elRes.ok) {
        const body = await elRes.json();
        throw new Error(body.error ?? "Failed to get ElevenLabs signed URL");
      }

      const { sessionToken } = await anamRes.json();
      const { signedUrl } = await elRes.json();
      console.log("Tokens fetched OK");

      // --- Anam setup ---
      const anamClient = createClient(sessionToken, {
        disableInputAudio: true,
      });
      anamClientRef.current = anamClient;

      anamClient.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
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
      });

      anamClient.addListener(AnamEvent.SESSION_READY, () => {
        // Flush any audio that arrived before Anam was ready
        for (const chunk of audioBufferRef.current) {
          audioInputStreamRef.current?.sendAudioChunk(chunk);
        }
        audioBufferRef.current = [];
        anamReadyRef.current = true;
      });

      await anamClient.streamToVideoElement("avatar-video");
      console.log("Anam streaming OK");

      const audioInputStream = anamClient.createAgentAudioInputStream({
        encoding: "pcm_s16le",
        sampleRate: 16000,
        channels: 1,
      });
      audioInputStreamRef.current = audioInputStream;

      // --- ElevenLabs setup ---
      console.log("Starting ElevenLabs session...");
      const conversation = await Conversation.startSession({
        signedUrl,

        onAudio: (base64Audio: string) => {
          // Record wall-clock start on first chunk of a speech turn
          if (cumulativeAudioMsRef.current === 0) {
            speechStartTimeRef.current = Date.now();
          }

          // Snapshot pre-chunk offset for onAudioAlignment
          chunkAudioOffsetRef.current = cumulativeAudioMsRef.current;

          if (anamReadyRef.current) {
            audioInputStreamRef.current?.sendAudioChunk(base64Audio);
          } else {
            audioBufferRef.current.push(base64Audio);
          }

          // PCM 16-bit mono @ 16 kHz → duration
          const paddingMatch = base64Audio.match(/=+$/);
          const padding = paddingMatch ? paddingMatch[0].length : 0;
          const bytes = (base64Audio.length * 3) / 4 - padding;
          const durationMs = (bytes / 2 / 16000) * 1000;
          cumulativeAudioMsRef.current += durationMs;
        },

        onAudioAlignment: ({
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
            // Accumulate full text immediately (used on finalize)
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

        onMessage: ({ role, message }: { role: string; message: string }) => {
          if (role === "user") {
            setMessages((prev) => [
              ...prev,
              { role: "user", text: message },
            ]);
          } else {
            // Capture complete agent text as ground truth for finalize
            agentMessageTextRef.current = message;
          }
        },

        onModeChange: ({ mode }: { mode: string }) => {
          if (mode === "listening") {
            audioInputStreamRef.current?.endSequence();
            finalizeAgentMessage();
          }
        },

        onDisconnect: () => {
          clearPendingTimers();
          setStatus("idle");
        },

        onError: (message: string) => {
          console.error("ElevenLabs error:", message);
          clearPendingTimers();
          setError(message);
          setStatus("error");
        },
      });

      // Mute ElevenLabs speaker — audio plays through Anam's WebRTC stream
      conversation.setVolume({ volume: 0 });
      conversationRef.current = conversation;

      setStatus("connected");
    } catch (err) {
      console.error("Start error:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null
            ? JSON.stringify(err)
            : String(err);
      setError(message);
      setStatus("error");
    }
  }, [
    presets,
    selectedIndex,
    clearPendingTimers,
    resetStreamingState,
    finalizeAgentMessage,
    scheduleTextUpdate,
  ]);

  const stop = useCallback(async () => {
    clearPendingTimers();
    resetStreamingState();
    try {
      await conversationRef.current?.endSession();
    } catch {}
    try {
      await anamClientRef.current?.stopStreaming();
    } catch {}
    conversationRef.current = null;
    anamClientRef.current = null;
    audioInputStreamRef.current = null;
    anamReadyRef.current = false;
    audioBufferRef.current = [];
    setStatus("idle");
  }, [clearPendingTimers, resetStreamingState]);

  return (
    <div className="w-full max-w-2xl flex flex-col items-center gap-4">
      {/* Persona selector */}
      <div className="flex gap-2">
        {presets.map((preset, i) => (
          <button
            key={i}
            onClick={() => setSelectedIndex(i)}
            disabled={status === "connecting" || status === "connected"}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
              i === selectedIndex
                ? "bg-white text-black"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Avatar video */}
      <div className="relative w-full aspect-[720/480] rounded-lg overflow-hidden bg-black">
        <video
          id="avatar-video"
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            Click Start to begin
          </div>
        )}
        {status === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
            Connecting...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {status === "idle" || status === "error" ? (
          <button
            onClick={start}
            className="px-6 py-2 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
          >
            Start
          </button>
        ) : status === "connecting" ? (
          <button
            disabled
            className="px-6 py-2 rounded-full bg-zinc-700 text-zinc-400 font-medium cursor-not-allowed"
          >
            Connecting...
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-6 py-2 rounded-full bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
          >
            Stop
          </button>
        )}

        <span className="text-sm text-zinc-500">
          {status === "connected" && "Connected — speak into your mic"}
          {status === "error" && error && `Error: ${error}`}
        </span>
      </div>

      {/* Transcript */}
      {messages.length > 0 && (
        <div className="w-full max-h-64 overflow-y-auto rounded-lg border border-zinc-800 p-4 space-y-2 text-sm">
          {messages.map((msg, i) => (
            <div key={i} className="flex gap-2">
              <span
                className={
                  msg.role === "user"
                    ? "text-blue-400 font-medium"
                    : "text-green-400 font-medium"
                }
              >
                {msg.role === "user" ? "You:" : "Agent:"}
              </span>
              <span
                className={
                  msg.interrupted
                    ? "text-zinc-300 italic"
                    : "text-zinc-300"
                }
              >
                {msg.text}
                {msg.interrupted && (
                  <span className="text-zinc-500 ml-1">[interrupted]</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
