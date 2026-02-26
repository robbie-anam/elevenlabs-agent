***This is the client side example, it is strongly recommended to use the server side version on the [main branch](https://github.com/robbie-anam/elevenlabs-agent/tree/main) unless you have a specific use case for client side control of Elevenlabs. The serverside integration provides latency and other benefits.***


# ElevenLabs Expressive Voice Agent + Anam Avatar

A Next.js app that connects an ElevenLabs voice agent (voice-to-voice via WebSocket) to an Anam avatar for real-time lip-synced video. ElevenLabs handles STT → LLM → TTS, Anam handles face generation from the audio.

## Audio Flow

```
User speaks → ElevenLabs SDK (mic) → WebSocket → ElevenLabs (STT → LLM → TTS)
                                                                   ↓
<video> ← Anam WebRTC ← sendAudioChunk() ← onAudio callback ← base64 PCM chunks
```

## How It Works

This app bridges two SDKs:

- **[ElevenLabs](https://elevenlabs.io)** handles voice intelligence — the SDK captures microphone audio, sends it over a WebSocket to ElevenLabs' cloud (STT → LLM → TTS), and returns synthesized speech as base64 PCM chunks.
- **[Anam](https://anam.ai)** handles avatar rendering — it takes those PCM audio chunks via `sendAudioChunk()` and generates a real-time lip-synced video face delivered over WebRTC.

The ElevenLabs SDK's built-in speaker is muted (volume 0) so the user only hears audio through the avatar's WebRTC stream.

**Streaming transcript:** The ElevenLabs SDK provides per-character timing data via the `onAudioAlignment` callback. The app uses this to reveal transcript text character-by-character in sync with the avatar's speech, offset by a render delay to account for Anam's face generation pipeline. See `src/hooks/useStreamingTranscript.ts` for the timing model.

## Setup

### 1. ElevenLabs Agent

1. Go to [elevenlabs.io](https://elevenlabs.io) → **Agents** → **Create Agent**
2. Configure your agent's system prompt and personality
3. Under **Agent Voice**, select **V3 Conversational** as the TTS model (enables expressive mode)
4. Under **Advanced** settings, set output audio format to `pcm_16000`
5. Copy the **Agent ID**

### 2. Anam Avatar

1. Go to [lab.anam.ai](https://lab.anam.ai) → create an account
2. Copy your **API Key** from the API Keys page
3. Pick an **Avatar ID** from the Avatars page

### 3. Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in the shared keys and at least one persona:

| Variable | Source |
|---|---|
| `ANAM_API_KEY` | lab.anam.ai → API Keys |
| `ELEVENLABS_API_KEY` | elevenlabs.io → API Keys |

Each persona is an avatar + agent pair. You can configure up to 3 — they appear as selector buttons in the UI:

| Variable | Source |
|---|---|
| `PERSONA_1_NAME` | Display label (defaults to "Persona 1") |
| `PERSONA_1_AVATAR_ID` | lab.anam.ai → Avatars |
| `PERSONA_1_AGENT_ID` | elevenlabs.io → Agents dashboard |
| `PERSONA_2_NAME` | (optional) Display label (defaults to "Persona 2") |
| `PERSONA_2_AVATAR_ID` | (optional) second avatar |
| `PERSONA_2_AGENT_ID` | (optional) second agent |
| `PERSONA_3_NAME` | (optional) Display label (defaults to "Persona 3") |
| `PERSONA_3_AVATAR_ID` | (optional) third avatar |
| `PERSONA_3_AGENT_ID` | (optional) third agent |

### 4. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Start**, grant mic permission, and speak.
