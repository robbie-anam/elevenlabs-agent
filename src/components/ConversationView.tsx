/**
 * ConversationView — starts an Anam avatar session backed by an ElevenLabs
 * voice agent running server-side on the engine.
 *
 * The client only deals with the Anam SDK — mic audio is captured over
 * WebRTC, and the avatar video + audio are streamed back. All ElevenLabs
 * STT → LLM → TTS orchestration happens on the engine.
 */
"use client";

import { useRef, useState, useCallback } from "react";
import { AnamEvent, createClient, type AnamClient } from "@anam-ai/js-sdk";
import type { Preset } from "@/app/page";

type Status = "idle" | "connecting" | "connected" | "error";

type Message = {
  id: string;
  role: "user" | "persona";
  content: string;
  interrupted?: boolean;
};

export default function ConversationView({
  presets,
}: {
  presets: Preset[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);

  const anamClientRef = useRef<AnamClient | null>(null);

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setMessages([]);

    try {
      const { avatarId, agentId } = presets[selectedIndex];

      const res = await fetch("/api/anam-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId, agentId }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to get session token");
      }

      const { sessionToken } = await res.json();

      // Debug: decode JWT to inspect token type
      try {
        const payload = JSON.parse(atob(sessionToken.split(".")[1]));
        console.log("Token payload:", payload);
      } catch {}

      const anamClient = createClient(sessionToken, {
        ...(process.env.NEXT_PUBLIC_ANAM_API_URL && {
          api: { baseUrl: process.env.NEXT_PUBLIC_ANAM_API_URL },
        }),
      });
      anamClientRef.current = anamClient;

      // Stream events fire on every chunk; accumulate into messages by id
      anamClient.addListener(
        AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED,
        (evt: {
          id: string;
          content: string;
          role: string;
          endOfSpeech: boolean;
          interrupted: boolean;
        }) => {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === evt.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = {
                ...next[idx],
                content: next[idx].content + evt.content,
                interrupted: evt.interrupted,
              };
              return next;
            }
            return [
              ...prev,
              {
                id: evt.id,
                role: evt.role as "user" | "persona",
                content: evt.content,
                interrupted: evt.interrupted,
              },
            ];
          });
        }
      );

      anamClient.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        setStatus("idle");
      });

      await anamClient.streamToVideoElement("avatar-video");
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
  }, [presets, selectedIndex]);

  const stop = useCallback(async () => {
    try {
      await anamClientRef.current?.stopStreaming();
    } catch {}
    anamClientRef.current = null;
    setStatus("idle");
  }, []);

  return (
    <div className="w-full max-w-2xl flex flex-col items-center gap-4">
      {/* Persona selector — hidden when only one preset */}
      {presets.length > 1 && (
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
      )}

      {/* Avatar video */}
      <div className="relative w-full aspect-[720/480] rounded-lg overflow-hidden">
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
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-2">
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
                {msg.content}
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
