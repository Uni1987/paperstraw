import { NextResponse } from "next/server";
import { buildCruiseOpsStatus } from "@/lib/cruises/adminOps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const status = await buildCruiseOpsStatus();
  return NextResponse.json(status);
}
