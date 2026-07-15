import { handleCronIngest } from "@/lib/api/cronIngest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  return handleCronIngest(request);
}

export async function POST(request: Request) {
  return handleCronIngest(request);
}

export function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: "GET, POST" } });
}
