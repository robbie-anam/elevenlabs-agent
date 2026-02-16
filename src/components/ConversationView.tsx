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

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setMessages([]);
    anamReadyRef.current = false;
    audioBufferRef.current = [];

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

      // --- Anam setup ---
      const anamClient = createClient(sessionToken, {
        disableInputAudio: true,
      });
      anamClientRef.current = anamClient;

      anamClient.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
        // Mark the last agent message as interrupted
        setMessages((prev) => {
          const last = [...prev];
          for (let i = last.length - 1; i >= 0; i--) {
            if (last[i].role === "agent") {
              last[i] = { ...last[i], interrupted: true };
              break;
            }
          }
          return last;
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

      const audioInputStream = anamClient.createAgentAudioInputStream({
        encoding: "pcm_s16le",
        sampleRate: 16000,
        channels: 1,
      });
      audioInputStreamRef.current = audioInputStream;

      // --- ElevenLabs setup ---
      const conversation = await Conversation.startSession({
        signedUrl,

        onAudio: (base64Audio: string) => {
          if (anamReadyRef.current) {
            audioInputStreamRef.current?.sendAudioChunk(base64Audio);
          } else {
            audioBufferRef.current.push(base64Audio);
          }
        },

        onMessage: ({ role, message }: { role: string; message: string }) => {
          setMessages((prev) => [
            ...prev,
            { role: role as "user" | "agent", text: message },
          ]);
        },

        onModeChange: ({ mode }: { mode: string }) => {
          if (mode === "listening") {
            audioInputStreamRef.current?.endSequence();
          }
        },

        onDisconnect: () => {
          setStatus("idle");
        },

        onError: (message: string) => {
          console.error("ElevenLabs error:", message);
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
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [presets, selectedIndex]);

  const stop = useCallback(async () => {
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
  }, []);

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
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
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
