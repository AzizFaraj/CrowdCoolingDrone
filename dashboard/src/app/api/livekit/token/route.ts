import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = readRequiredEnv("LIVEKIT_API_KEY");
    const apiSecret = readRequiredEnv("LIVEKIT_API_SECRET");
    const livekitUrl =
      process.env.LIVEKIT_URL ??
      process.env.NEXT_PUBLIC_LIVEKIT_URL ??
      "";

    if (!livekitUrl) {
      throw new Error("Missing required environment variable: LIVEKIT_URL or NEXT_PUBLIC_LIVEKIT_URL");
    }

    const { searchParams } = new URL(request.url);
    const room = searchParams.get("room") ?? process.env.NEXT_PUBLIC_LIVEKIT_ROOM ?? "drone-1";
    const identity =
      searchParams.get("identity") ??
      `dashboard-${Date.now()}`;
    const name = searchParams.get("name") ?? "Dashboard Operator";
    const canPublish = searchParams.get("publish") === "1";
    const canSubscribe = searchParams.get("subscribe") !== "0";

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canSubscribe,
      canPublishData: canPublish,
    });

    return NextResponse.json({
      token: await token.toJwt(),
      url: livekitUrl,
      room,
      identity,
      name,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create LiveKit token.",
      },
      { status: 500 },
    );
  }
}
