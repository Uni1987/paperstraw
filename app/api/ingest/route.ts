import { NextResponse } from "next/server";
import { runDailyIngestion } from "@/lib/ingestion/daily";
import { runScheduledIngestion } from "@/lib/ingestion/scheduled";

export async function POST(request: Request) {
  const { provider } = (await request.json().catch(() => ({}))) as { provider?: "daily" | "adsb_lol" | "adsb_exchange" | "opensky" };
  return ingest(provider);
}

export async function GET(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  return ingest(provider);
}

async function ingest(provider: string | null | undefined) {
  if (provider === "daily") {
    const result = await runDailyIngestion();
    return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
  }

  if (provider !== "adsb_lol" && provider !== "adsb_exchange" && provider !== "opensky") {
    return NextResponse.json({ error: "provider must be daily, adsb_lol, adsb_exchange or opensky" }, { status: 400 });
  }

  const result = await runScheduledIngestion(provider);
  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
