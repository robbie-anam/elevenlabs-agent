# ElevenLabs Expressive Voice Agent + Anam Avatar

A Next.js app that connects an ElevenLabs voice agent (voice-to-voice via WebSocket) to an Anam avatar for real-time lip-synced video. ElevenLabs handles STT → LLM → TTS, Anam handles face generation from the audio.

## Audio Flow

```
User speaks → ElevenLabs SDK (mic) → WebSocket → ElevenLabs (STT → LLM → TTS)
                                                                   ↓
<video> ← Anam WebRTC ← sendAudioChunk() ← onAudio callback ← base64 PCM chunks
```

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

Fill in all four values:

| Variable | Source |
|---|---|
| `ANAM_API_KEY` | lab.anam.ai → API Keys |
| `ANAM_AVATAR_ID` | lab.anam.ai → Avatars |
| `ELEVENLABS_API_KEY` | elevenlabs.io → API Keys |
| `ELEVENLABS_AGENT_ID` | elevenlabs.io → Agents dashboard |

### 4. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Start**, grant mic permission, and speak.

## Deploy to Vercel

1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add the four environment variables in Vercel dashboard
4. Deploy

## Verification Checklist

- [ ] Avatar lip-syncs to agent responses
- [ ] No double audio (only hear audio from avatar, not from ElevenLabs SDK)
- [ ] Interruption works (speak while agent is talking)
- [ ] Transcript shows both user and agent messages
- [ ] `npm run build` succeeds (Vercel-compatible)
