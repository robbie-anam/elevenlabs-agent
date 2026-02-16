import ConversationView from "@/components/ConversationView";

export type Preset = {
  label: string;
  avatarId: string;
  agentId: string;
};

export default function Home() {
  const presets: Preset[] = [
    {
      label: "Excited about Anam",
      avatarId: process.env.PERSONA_1_AVATAR_ID ?? "",
      agentId: process.env.PERSONA_1_AGENT_ID ?? "",
    },
    {
      label: "Sad about Dinner",
      avatarId: process.env.PERSONA_2_AVATAR_ID ?? "",
      agentId: process.env.PERSONA_2_AGENT_ID ?? "",
    },
    {
      label: "Soothing Storyteller",
      avatarId: process.env.PERSONA_3_AVATAR_ID ?? "",
      agentId: process.env.PERSONA_3_AGENT_ID ?? "",
    },
  ];

  return (
    <main className="min-h-dvh flex flex-col items-center p-4 sm:p-8">
      <h1 className="text-2xl font-semibold mb-6">
        ElevenLabs Agent + Anam Avatar
      </h1>
      <ConversationView presets={presets} />
    </main>
  );
}
