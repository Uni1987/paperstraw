"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/auth/adminAuthorization";
import { parseFlightCsv } from "@/lib/ingestion/csv";
import { importFlights } from "@/lib/ingestion/importer";
import { dispatchHistoricalImportWorkflow } from "@/lib/ingestion/githubHistoricalWorkflow";
import { parseManualHistoricalImportForm } from "@/lib/ingestion/historicalRequest";
import { DataSourceProviders } from "@/lib/ingestion/providerConstants";
import { logSecurityAuditEvent } from "@/lib/security/audit";

const MAX_CSV_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_CSV_IMPORT_RECORDS = 50_000;

export async function uploadCsvAction(formData: FormData) {
  const authorization = await requireAdminAction({ action: "private-jets.csv-import", source: "server-action:uploadCsvAction" });
  const unexpectedField = findUnexpectedFormField(formData, new Set(["file"]));
  if (unexpectedField) {
    logPrivilegedAction(authorization, "private-jets.csv-import", "rejected", "invalid-form-fields");
    redirect("/admin/private-jets?error=Invalid+CSV+import+request");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    logPrivilegedAction(authorization, "private-jets.csv-import", "rejected", "missing-file");
    redirect("/admin/private-jets?error=Choose+a+CSV+file+to+import");
  }

  const csvFile = file as File;
  if (csvFile.size > MAX_CSV_UPLOAD_BYTES || !csvFile.name.toLowerCase().endsWith(".csv")) {
    logPrivilegedAction(authorization, "private-jets.csv-import", "rejected", "invalid-file");
    redirect("/admin/private-jets?error=Choose+a+CSV+file+up+to+4+MB");
  }
  const csv = await csvFile.text();
  const parsed = parseFlightCsv(csv);

  if (parsed.errors.length) {
    logPrivilegedAction(authorization, "private-jets.csv-import", "rejected", "invalid-csv");
    redirect(`/admin/private-jets?error=${encodeURIComponent(parsed.errors.slice(0, 5).join(" | "))}`);
  }
  if (parsed.records.length > MAX_CSV_IMPORT_RECORDS) {
    logPrivilegedAction(authorization, "private-jets.csv-import", "rejected", "record-limit");
    redirect(`/admin/private-jets?error=${encodeURIComponent(`CSV imports are limited to ${MAX_CSV_IMPORT_RECORDS.toLocaleString()} rows.`)}`);
  }

  let result: Awaited<ReturnType<typeof importFlights>>;
  try {
    result = await importFlights(parsed.records, DataSourceProviders.CSV_UPLOAD);
  } catch {
    logPrivilegedAction(authorization, "private-jets.csv-import", "failed", "import-failed");
    redirect("/admin/private-jets?error=CSV+import+failed");
  }
  revalidatePath("/");
  revalidatePath("/comparisons");

  if (result.errors.length) {
    logPrivilegedAction(authorization, "private-jets.csv-import", "failed", "partial-import");
    redirect(`/admin/private-jets?warning=${encodeURIComponent(`Imported ${result.imported} rows with ${result.errors.length} issue(s).`)}`);
  }

  logPrivilegedAction(authorization, "private-jets.csv-import", "success");
  redirect(`/admin/private-jets?success=${encodeURIComponent(`Imported ${result.imported} flight record(s).`)}`);
}

export async function startHistoricalImportAction(formData: FormData) {
  const authorization = await requireAdminAction({
    action: "private-jets.historical-import.dispatch",
    source: "server-action:startHistoricalImportAction"
  });
  let targetUrl: string;
  try {
    const unexpectedField = findUnexpectedFormField(formData, new Set(["from", "to", "force"]));
    if (unexpectedField || (formData.has("force") && formData.get("force") !== "on")) {
      throw new Error("Invalid historical import request.");
    }
    const request = parseManualHistoricalImportForm(formData);
    const result = await dispatchHistoricalImportWorkflow(request);
    revalidatePath("/admin/private-jets");
    const detail = result.status === "skipped"
      ? `No job was started. ${result.skippedDateKeys.length} requested date(s) were already imported successfully.`
      : `Historical import job ${result.jobId} was dispatched for ${request.from.toISOString().slice(0, 10)} through ${request.to.toISOString().slice(0, 10)}. Refresh this page to see completion status.`;
    logSecurityAuditEvent({
      action: "private-jets.historical-import.dispatch",
      result: "success",
      source: "server-action:startHistoricalImportAction",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      target: `${request.from.toISOString().slice(0, 10)}:${request.to.toISOString().slice(0, 10)}`
    });
    targetUrl = `/admin/private-jets?success=${encodeURIComponent(detail)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical import dispatch failed";
    logPrivilegedAction(authorization, "private-jets.historical-import.dispatch", "failed", "dispatch-failed");
    targetUrl = `/admin/private-jets?error=${encodeURIComponent(message)}`;
  }

  redirect(targetUrl);
}

function findUnexpectedFormField(formData: FormData, allowedFields: Set<string>) {
  for (const key of formData.keys()) {
    if (!allowedFields.has(key) && !key.startsWith("$ACTION_")) return key;
  }
  return null;
}

function logPrivilegedAction(
  authorization: Awaited<ReturnType<typeof requireAdminAction>>,
  action: string,
  result: "success" | "rejected" | "failed",
  reason?: string
) {
  logSecurityAuditEvent({
    action,
    result,
    source: "server-action",
    requestId: authorization.requestId,
    adminUsername: authorization.adminUsername,
    reason
  });
}
