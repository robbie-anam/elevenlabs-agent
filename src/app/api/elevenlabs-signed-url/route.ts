import { NextResponse } from "next/server";

/** Gets an ElevenLabs signed WebSocket URL for the given agent. */
export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY must be set" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const agentId = body.agentId;

  if (!agentId) {
    return NextResponse.json(
      { error: "agentId is required" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    {
      headers: { "xi-api-key": apiKey },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `ElevenLabs API error: ${res.status} ${text}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json({ signedUrl: data.signed_url });
}
