import { handleCronIngest } from "@/lib/api/cronIngest";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  return handleCronIngest(request);
}

export async function POST(request: Request) {
  return handleCronIngest(request);
}
