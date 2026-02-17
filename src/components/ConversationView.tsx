/**
 * ConversationView — orchestrates an ElevenLabs voice agent with an Anam avatar.
 *
 * Audio flow:
 *   User speaks → mic captured by ElevenLabs SDK → WebSocket → ElevenLabs cloud
 *   (STT → LLM → TTS) → base64 PCM chunks arrive via onAudio callback →
 *   forwarded to Anam via sendAudioChunk() → Anam generates a face video
 *   stream delivered over WebRTC to the <video> element.
 *
 * The ElevenLabs SDK is muted (volume 0) so the user only hears audio through
 * the avatar's WebRTC stream, avoiding double playback.
 *
 * Transcript streaming is handled by useStreamingTranscript — it schedules
 * character reveals timed to match the avatar's speech using alignment data
 * from ElevenLabs.
 */
"use client";

import { useRef, useState, useCallback } from "react";
import { AnamEvent, createClient, type AnamClient } from "@anam-ai/js-sdk";
import { Conversation } from "@elevenlabs/client";
import type { Preset } from "@/app/page";
import { useStreamingTranscript } from "@/hooks/useStreamingTranscript";

type Status = "idle" | "connecting" | "connected" | "error";

export default function ConversationView({
  presets,
}: {
  presets: Preset[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const anamClientRef = useRef<AnamClient | null>(null);
  const audioInputStreamRef = useRef<ReturnType<
    AnamClient["createAgentAudioInputStream"]
  > | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const anamReadyRef = useRef(false);
  const audioBufferRef = useRef<string[]>([]);

  const transcript = useStreamingTranscript();

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    anamReadyRef.current = false;
    audioBufferRef.current = [];
    transcript.reset();

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

      anamClient.addListener(
        AnamEvent.TALK_STREAM_INTERRUPTED,
        transcript.handleInterrupt
      );

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
          transcript.handleAudioChunk(base64Audio);

          if (anamReadyRef.current) {
            audioInputStreamRef.current?.sendAudioChunk(base64Audio);
          } else {
            audioBufferRef.current.push(base64Audio);
          }
        },

        onAudioAlignment: transcript.handleAlignment,

        onMessage: ({ role, message }: { role: string; message: string }) => {
          if (role === "user") {
            transcript.addUserMessage(message);
          } else {
            transcript.handleAgentMessage(message);
          }
        },

        onModeChange: ({ mode }: { mode: string }) => {
          if (mode === "listening") {
            audioInputStreamRef.current?.endSequence();
            transcript.handleAgentDone();
          }
        },

        onDisconnect: () => {
          transcript.cleanup();
          setStatus("idle");
        },

        onError: (message: string) => {
          console.error("ElevenLabs error:", message);
          transcript.cleanup();
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
  }, [presets, selectedIndex, transcript]);

  const stop = useCallback(async () => {
    transcript.cleanup();
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
  }, [transcript]);

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
      {transcript.messages.length > 0 && (
        <div className="w-full max-h-64 overflow-y-auto rounded-lg border border-zinc-800 p-4 space-y-2 text-sm">
          {transcript.messages.map((msg, i) => (
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
