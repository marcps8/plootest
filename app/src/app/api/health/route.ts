import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ploot-scheduler-api",
    region: process.env.VERCEL_REGION ?? "local",
  });
}
