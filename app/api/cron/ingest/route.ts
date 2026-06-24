import { handleCronIngest } from "@/lib/api/cronIngest";

export async function GET(request: Request) {
  return handleCronIngest(request);
}

export async function POST(request: Request) {
  return handleCronIngest(request);
}
