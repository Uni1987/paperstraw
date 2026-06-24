import { recalculateAggregateRollups } from "@/lib/awareness/rollups";
import { AdsbLolClient } from "./adsbLol";
import { createDailyImportLog } from "./importLogs";
import { importFlights } from "./importer";
import { ImportStatuses } from "./importStatus";
import { filterPrivateJetRecords } from "./privateJets";
import { ADSB_LOL_DATA_SOURCE } from "./providerConstants";
import { getIngestionCursor, IngestionModes, updateIngestionCursor } from "./state";
import type { NormalizedFlightRecord } from "./types";

export async function runDailyIngestion() {
  const runStartedAt = new Date();
  const cursor = await getIngestionCursor(ADSB_LOL_DATA_SOURCE, IngestionModes.DAILY_API);
  const lastImportedAt = cursor?.lastImportedAt ? new Date(cursor.lastImportedAt) : null;
  let recordsFetched = 0;
  let recordsConsidered = 0;

  try {
    const client = new AdsbLolClient("");
    const records = filterPrivateJetRecords(await client.fetchRecentFlights());
    recordsFetched = records.length;
    const incrementalRecords = getRecordsNewerThanCursor(records, lastImportedAt);
    recordsConsidered = incrementalRecords.length;

    const result = await importFlights(incrementalRecords.map(forceAdsbLolProvider), ADSB_LOL_DATA_SOURCE, {
      writeImportLog: false
    });
    const latestImportedAt = maxDate([lastImportedAt, ...records.map((record) => record.departureAt)]);
    const aggregateResult = await recalculateAggregateRollups();
    const status = result.errors.length === 0 ? ImportStatuses.SUCCESS : result.imported > 0 ? ImportStatuses.PARTIAL : ImportStatuses.FAILED;
    const runEndedAt = new Date();

    await updateIngestionCursor({
      provider: ADSB_LOL_DATA_SOURCE,
      mode: IngestionModes.DAILY_API,
      status,
      recordsImported: result.imported,
      lastImportedAt: latestImportedAt
    });
    await createDailyImportLog({
      provider: ADSB_LOL_DATA_SOURCE,
      mode: IngestionModes.DAILY_API,
      runStartedAt,
      runEndedAt,
      status,
      recordsFetched,
      recordsConsidered,
      recordsImported: result.imported,
      errors: [result.skipped ? `${result.skipped} duplicate record(s) skipped.` : null, result.errors.length ? result.errors.join("\n") : null]
        .filter(Boolean)
        .join("\n") || null
    });

    return {
      provider: "adsb_lol",
      imported: result.imported,
      skipped: result.skipped,
      fetched: records.length,
      considered: incrementalRecords.length,
      since: lastImportedAt,
      lastImportedAt: latestImportedAt,
      errors: result.errors,
      rollups: aggregateResult.rollups
    };
  } catch (error) {
    const message = `adsb_lol: ${error instanceof Error ? error.message : "Unknown provider error"}`;
    await updateIngestionCursor({
      provider: ADSB_LOL_DATA_SOURCE,
      mode: IngestionModes.DAILY_API,
      status: ImportStatuses.FAILED,
      recordsImported: 0,
      lastImportedAt,
      error: message
    });
    await createDailyImportLog({
      provider: ADSB_LOL_DATA_SOURCE,
      mode: IngestionModes.DAILY_API,
      runStartedAt,
      runEndedAt: new Date(),
      status: ImportStatuses.FAILED,
      recordsFetched,
      recordsConsidered,
      recordsImported: 0,
      errors: message
    });
    throw new Error(message);
  }
}

function forceAdsbLolProvider(record: NormalizedFlightRecord): NormalizedFlightRecord {
  return { ...record, dataSource: ADSB_LOL_DATA_SOURCE };
}

function maxDate(dates: Array<Date | null | undefined>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));
  if (!validDates.length) return null;
  return new Date(Math.max(...validDates.map((date) => date.getTime())));
}

export function getRecordsNewerThanCursor(records: NormalizedFlightRecord[], lastImportedAt: Date | null) {
  if (!lastImportedAt) return records;
  return records.filter((record) => record.departureAt.getTime() > lastImportedAt.getTime());
}
