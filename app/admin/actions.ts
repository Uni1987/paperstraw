"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runDailyIngestion } from "@/lib/ingestion/daily";
import { parseFlightCsv } from "@/lib/ingestion/csv";
import { importFlights } from "@/lib/ingestion/importer";
import { DataSourceProviders } from "@/lib/ingestion/providerConstants";

export async function uploadCsvAction(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin?error=Choose+a+CSV+file+to+import");
  }

  const csvFile = file as File;
  const csv = await csvFile.text();
  const parsed = parseFlightCsv(csv);

  if (parsed.errors.length) {
    redirect(`/admin?error=${encodeURIComponent(parsed.errors.slice(0, 5).join(" | "))}`);
  }

  const result = await importFlights(parsed.records, DataSourceProviders.CSV_UPLOAD);
  revalidatePath("/");
  revalidatePath("/comparisons");

  if (result.errors.length) {
    redirect(`/admin?warning=${encodeURIComponent(`Imported ${result.imported} rows with ${result.errors.length} issue(s).`)}`);
  }

  redirect(`/admin?success=${encodeURIComponent(`Imported ${result.imported} flight record(s).`)}`);
}

export async function runDailyImportAction(formData: FormData) {
  const adsbLolUrl = String(formData.get("adsbLolUrl") ?? "").trim();
  if (adsbLolUrl) {
    process.env.ADSB_LOL_DAILY_URL = adsbLolUrl;
  }

  let targetUrl: string;
  try {
    const result = await runDailyIngestion();
    revalidatePath("/");
    revalidatePath("/data");
    revalidatePath("/leaderboard");
    revalidatePath("/aircraft-types");
    revalidatePath("/comparisons");
    revalidatePath("/admin");

    const detail = result.imported === 0
      ? `Latest data refresh ran via ${result.provider}, fetched ${result.fetched} record(s), considered ${result.considered} newer record(s), and imported 0 new private jet record(s).`
      : `Latest data refresh used ${result.provider}, fetched ${result.fetched} record(s), considered ${result.considered} newer record(s), imported ${result.imported} record(s), skipped ${result.skipped} duplicate record(s), and recalculated ${result.rollups} aggregate rollup(s).`;

    targetUrl = `/admin?success=${encodeURIComponent(detail)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Latest data refresh failed";
    const hint = message.includes("DATABASE_URL") || message.includes("datasource")
      ? `${message} Restart pnpm dev after changing .env. Expected PostgreSQL DATABASE_URL is the pooled Neon connection string.`
      : message;
    targetUrl = `/admin?error=${encodeURIComponent(hint)}`;
  }

  redirect(targetUrl);
}
