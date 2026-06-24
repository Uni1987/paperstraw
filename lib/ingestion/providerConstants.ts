export const DataSourceProviders = {
  ADSB_LOL: "ADSB_LOL",
  ADSB_EXCHANGE: "ADSB_EXCHANGE",
  OPENSKY: "OPENSKY",
  CSV_UPLOAD: "CSV_UPLOAD"
} as const;

export type DataSourceProviderValue = (typeof DataSourceProviders)[keyof typeof DataSourceProviders];

export const ADSB_LOL_DATA_SOURCE = DataSourceProviders.ADSB_LOL;
