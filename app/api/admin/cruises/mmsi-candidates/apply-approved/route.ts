import { NextResponse, type NextRequest } from "next/server";
import { applyApprovedMmsiReviewCandidates } from "@/lib/cruises/mmsiReviewWorkflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const confirm = body?.confirm === true;
    const result = await applyApprovedMmsiReviewCandidates({ confirm });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply approved failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
