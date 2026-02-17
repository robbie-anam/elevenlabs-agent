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
      <a
        href="https://anam.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-6 left-6 sm:left-10 z-10 h-6 sm:h-7"
      >
        <svg
          height="100%"
          viewBox="0 0 86 29"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18.1491 28.1986L16.2127 21.63L6.3408 21.63L4.40439 28.1986H0L9.03659 -1.79687L13.4789 -1.79687L22.5535 28.1986H18.1491ZM7.47986 17.8331L15.0736 17.8331L11.2767 4.96161L7.47986 17.8331Z"
            fill="white"
          />
          <path
            d="M24.7666 28.1984L24.7666 7.69518L39.5745 7.69518V28.1984L35.3979 28.1984V11.4921L28.9432 11.4921L28.9432 28.1984H24.7666Z"
            fill="white"
          />
          <path
            d="M61.0239 28.1984V7.69518L85.7037 7.69518V28.1984H81.5271V11.4921L75.4521 11.4921V28.1984L71.2755 28.1984V11.4921L65.2005 11.4921V28.1984H61.0239Z"
            fill="white"
          />
          <path
            d="M42.8948 7.69518L57.7026 7.69518V28.1984L53.5261 28.1984V27.1353C52.4629 28.0466 51.0201 28.5781 49.3495 28.5781C45.4007 28.5781 42.8948 25.7305 42.8948 21.2501C42.8948 16.8457 45.4007 14.074 49.3495 14.074C51.0201 14.074 52.4629 14.5676 53.5261 15.4788V11.3022L42.8948 11.3022V7.69518ZM50.4885 24.7812C52.6148 24.7812 53.9437 23.4143 53.9057 21.2501C53.8678 19.0859 52.5389 17.681 50.4885 17.681C48.4003 17.681 47.0713 19.0859 47.0713 21.2501C47.0713 23.4143 48.4003 24.7812 50.4885 24.7812Z"
            fill="white"
          />
        </svg>
      </a>

      <h1 className="text-4xl sm:text-5xl font-bold mb-8 text-center tracking-tight">
        Anam X ElevenLabs<br />
        <span className="text-zinc-400">Expressive Voice Agents</span>
      </h1>
      <ConversationView presets={presets} />

      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-8 py-6 text-lg font-medium text-white bg-[var(--background)]/90 backdrop-blur-sm border-t border-zinc-700/50">
        <a
          href="https://anam.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2.5 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors"
        >
          Sign Up For Free &rarr;
        </a>
        <a
          href="https://anam.ai/cookbook/elevenlabs-expressive-voice-agents"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-2.5 rounded-full border border-zinc-500 text-white hover:bg-zinc-800 transition-colors"
        >
          Build Your Own &rarr;
        </a>
      </footer>
    </main>
  );
}
