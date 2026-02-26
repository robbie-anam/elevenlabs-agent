# ElevenLabs Expressive Voice Agent + Anam Avatar

> **This branch uses the server-side integration** — the Anam engine connects to ElevenLabs directly. The client only uses the Anam SDK. If you need direct client-side control over the ElevenLabs connection, see the [`clientside_version`](https://github.com/anam-org/elevenlabs-agent/tree/clientside_version) branch.

A Next.js app that pairs an ElevenLabs conversational agent with an Anam avatar. ElevenLabs handles STT → LLM → TTS, Anam handles real-time lip-synced face generation — all orchestrated server-side by the Anam engine.

## Architecture

```
Client (Anam JS SDK) ──WebRTC──▶ Anam Engine ◀──WebSocket──▶ ElevenLabs (STT → LLM → TTS)
                                      │
                              Face generation
                                      │
                              WebRTC video/audio ──▶ Client
```

## How It Works

1. The Next.js API route (`/api/anam-session`) fetches an ElevenLabs **signed URL** using your API key, then requests an Anam **session token** with `elevenLabsAgentSettings` attached.
2. The Anam engine uses the signed URL to open a WebSocket to ElevenLabs and manages the full voice pipeline — speech-to-text, LLM reasoning, and text-to-speech.
3. The client creates an `AnamClient` with the session token and calls `streamToVideoElement()`. Mic audio goes to the engine over WebRTC; the avatar video and speech audio come back over the same connection.
4. No ElevenLabs SDK is needed on the client — the only dependency is `@anam-ai/js-sdk`.

## Setup

### 1. ElevenLabs Agent

1. Go to [elevenlabs.io](https://elevenlabs.io) → **Agents** → **Create Agent**
2. Configure your agent's system prompt and personality
3. Under **Agent Voice**, select **V3 Conversational** as the TTS model (enables expressive mode)
4. Copy the **Agent ID**

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
