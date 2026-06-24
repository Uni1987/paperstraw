import { prisma } from "@/lib/prisma";
import { AdsbExchangeClient } from "./adsbExchange";
import { AdsbLolClient } from "./adsbLol";
import { importFlights } from "./importer";
import { OpenSkyClient } from "./openSky";
import { ImportStatuses } from "./importStatus";
import { ADSB_LOL_DATA_SOURCE, DataSourceProviders } from "./providerConstants";

export async function runScheduledIngestion(provider: "adsb_lol" | "adsb_exchange" | "opensky") {
  const client =
    provider === "adsb_lol"
      ? new AdsbLolClient()
      : provider === "adsb_exchange"
      ? new AdsbExchangeClient()
      : new OpenSkyClient();

  const dataSource =
    provider === "adsb_lol"
      ? ADSB_LOL_DATA_SOURCE
      : provider === "adsb_exchange"
      ? DataSourceProviders.ADSB_EXCHANGE
      : DataSourceProviders.OPENSKY;

  try {
    const records = await client.fetchRecentFlights();
    return importFlights(records, dataSource);
  } catch (error) {
    await prisma.importLog.create({
      data: {
        provider: dataSource,
        status: ImportStatuses.FAILED,
        recordsImported: 0,
        errors: error instanceof Error ? error.message : "Unknown ingestion error"
      }
    });
    throw error;
  }
}
