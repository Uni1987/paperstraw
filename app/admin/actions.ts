"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseFlightCsv } from "@/lib/ingestion/csv";
import { importFlights } from "@/lib/ingestion/importer";
import { dispatchHistoricalImportWorkflow } from "@/lib/ingestion/githubHistoricalWorkflow";
import { parseManualHistoricalImportForm } from "@/lib/ingestion/historicalRequest";
import { DataSourceProviders } from "@/lib/ingestion/providerConstants";

export async function uploadCsvAction(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/private-jets?error=Choose+a+CSV+file+to+import");
  }

  const csvFile = file as File;
  const csv = await csvFile.text();
  const parsed = parseFlightCsv(csv);

  if (parsed.errors.length) {
    redirect(`/admin/private-jets?error=${encodeURIComponent(parsed.errors.slice(0, 5).join(" | "))}`);
  }

  const result = await importFlights(parsed.records, DataSourceProviders.CSV_UPLOAD);
  revalidatePath("/");
  revalidatePath("/comparisons");

  if (result.errors.length) {
    redirect(`/admin/private-jets?warning=${encodeURIComponent(`Imported ${result.imported} rows with ${result.errors.length} issue(s).`)}`);
  }

  redirect(`/admin/private-jets?success=${encodeURIComponent(`Imported ${result.imported} flight record(s).`)}`);
}

export async function startHistoricalImportAction(formData: FormData) {
  let targetUrl: string;
  try {
    const request = parseManualHistoricalImportForm(formData);
    const result = await dispatchHistoricalImportWorkflow(request);
    revalidatePath("/admin/private-jets");
    const detail = result.status === "skipped"
      ? `No job was started. ${result.skippedDateKeys.length} requested date(s) were already imported successfully.`
      : `Historical import job ${result.jobId} was dispatched for ${request.from.toISOString().slice(0, 10)} through ${request.to.toISOString().slice(0, 10)}. Refresh this page to see completion status.`;
    targetUrl = `/admin/private-jets?success=${encodeURIComponent(detail)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical import dispatch failed";
    targetUrl = `/admin/private-jets?error=${encodeURIComponent(message)}`;
  }

  redirect(targetUrl);
}
