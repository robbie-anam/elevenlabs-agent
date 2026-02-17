import ConversationView from "@/components/ConversationView";

export type Preset = {
  label: string;
  avatarId: string;
  agentId: string;
};

export default function Home() {
  const presets: Preset[] = [
    {
      label: process.env.PERSONA_1_NAME ?? "Persona 1",
      avatarId: process.env.PERSONA_1_AVATAR_ID ?? "",
      agentId: process.env.PERSONA_1_AGENT_ID ?? "",
    },
    {
      label: process.env.PERSONA_2_NAME ?? "Persona 2",
      avatarId: process.env.PERSONA_2_AVATAR_ID ?? "",
      agentId: process.env.PERSONA_2_AGENT_ID ?? "",
    },
    {
      label: process.env.PERSONA_3_NAME ?? "Persona 3",
      avatarId: process.env.PERSONA_3_AVATAR_ID ?? "",
      agentId: process.env.PERSONA_3_AGENT_ID ?? "",
    },
  ].filter((p) => p.avatarId && p.agentId);

  return (
    <main className="min-h-dvh flex flex-col items-center p-4 sm:p-8 pb-16">
      <h1 className="text-4xl sm:text-5xl font-bold mb-8 text-center tracking-tight">
        Anam X ElevenLabs<br />
        <span className="text-zinc-400">Expressive Voice Agents</span>
      </h1>
      <ConversationView presets={presets} />

      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-6 py-5 text-base text-zinc-300 bg-[var(--background)]/80 backdrop-blur-sm border-t border-zinc-800/50">
        <a
          href="https://anam.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Sign Up For Free &rarr;
        </a>
        <span className="text-zinc-600">|</span>
        <a
          href="https://anam.ai/cookbook/elevenlabs-expressive"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Build Your Own &rarr;
        </a>
      </footer>
    </main>
  );
}
