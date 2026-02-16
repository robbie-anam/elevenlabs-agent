import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANAM_API_KEY must be set" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const avatarId = body.avatarId || process.env.ANAM_AVATAR_ID;

  if (!avatarId) {
    return NextResponse.json(
      { error: "avatarId is required" },
      { status: 400 }
    );
  }

  const res = await fetch("https://api.anam.ai/v1/auth/session-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      personaConfig: {
        avatarId,
        enableAudioPassthrough: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Anam API error: ${res.status} ${text}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json({ sessionToken: data.sessionToken });
}
