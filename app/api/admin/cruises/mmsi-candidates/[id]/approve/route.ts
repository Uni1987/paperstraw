import { NextResponse, type NextRequest } from "next/server";
import { approveMmsiReviewCandidate, listMmsiReviewCandidates } from "@/lib/cruises/mmsiReviewWorkflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_APPROVAL_NOTE = "Exact IMO static-data match; no existing MMSI link or conflict.";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await approveMmsiReviewCandidate(params.id, DEFAULT_APPROVAL_NOTE);
    const refreshed = await listMmsiReviewCandidates({ status: "all", limit: 100 });
    const candidate = refreshed.rows.find((row) => row.id === params.id) ?? null;
    const status = result.status === "approved" ? 200 : 400;

    return NextResponse.json({ result, candidate }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval failed.";
    return NextResponse.json({ result: { status: "failed", message } }, { status: 400 });
  }
}
