-- CreateTable
CREATE TABLE "cruise_ships" (
    "id" TEXT NOT NULL,
    "imo" TEXT,
    "mmsi" TEXT,
    "name" TEXT NOT NULL,
    "operator" TEXT,
    "ship_type" TEXT,
    "destination" TEXT,
    "gross_tonnage" DECIMAL(65,30),
    "length" DECIMAL(65,30),
    "width" DECIMAL(65,30),
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cruise_ships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruise_positions" (
    "id" TEXT NOT NULL,
    "ship_id" TEXT NOT NULL,
    "mmsi" TEXT NOT NULL,
    "latitude" DECIMAL(65,30) NOT NULL,
    "longitude" DECIMAL(65,30) NOT NULL,
    "speed_over_ground" DECIMAL(65,30),
    "course_over_ground" DECIMAL(65,30),
    "heading" INTEGER,
    "navigational_status" TEXT,
    "destination" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB,

    CONSTRAINT "cruise_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruise_emissions_annual" (
    "id" TEXT NOT NULL,
    "ship_id" TEXT NOT NULL,
    "imo" TEXT NOT NULL,
    "reporting_year" INTEGER NOT NULL,
    "annual_co2_tonnes" DECIMAL(65,30) NOT NULL,
    "annual_fuel_tonnes" DECIMAL(65,30),
    "distance_nm" DECIMAL(65,30),
    "time_at_sea_hours" DECIMAL(65,30),
    "source" TEXT NOT NULL,
    "raw_payload" JSONB,

    CONSTRAINT "cruise_emissions_annual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cruise_emissions_daily_estimates" (
    "id" TEXT NOT NULL,
    "ship_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "estimated_co2_tonnes" DECIMAL(65,30) NOT NULL,
    "estimated_fuel_tonnes" DECIMAL(65,30),
    "estimated_nox_kg" DECIMAL(65,30),
    "estimated_sox_kg" DECIMAL(65,30),
    "distance_nm" DECIMAL(65,30) NOT NULL,
    "hours_underway" DECIMAL(65,30) NOT NULL,
    "confidence_score" DECIMAL(65,30) NOT NULL,
    "method_version" TEXT NOT NULL,

    CONSTRAINT "cruise_emissions_daily_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cruise_ships_imo_key" ON "cruise_ships"("imo");

-- CreateIndex
CREATE UNIQUE INDEX "cruise_ships_mmsi_key" ON "cruise_ships"("mmsi");

-- CreateIndex
CREATE INDEX "cruise_ships_name_idx" ON "cruise_ships"("name");

-- CreateIndex
CREATE INDEX "cruise_ships_operator_idx" ON "cruise_ships"("operator");

-- CreateIndex
CREATE INDEX "cruise_positions_mmsi_timestamp_idx" ON "cruise_positions"("mmsi", "timestamp");

-- CreateIndex
CREATE INDEX "cruise_positions_ship_id_timestamp_idx" ON "cruise_positions"("ship_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "cruise_positions_mmsi_timestamp_latitude_longitude_key" ON "cruise_positions"("mmsi", "timestamp", "latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "cruise_emissions_annual_ship_id_reporting_year_key" ON "cruise_emissions_annual"("ship_id", "reporting_year");

-- CreateIndex
CREATE INDEX "cruise_emissions_annual_imo_idx" ON "cruise_emissions_annual"("imo");

-- CreateIndex
CREATE INDEX "cruise_emissions_annual_reporting_year_idx" ON "cruise_emissions_annual"("reporting_year");

-- CreateIndex
CREATE UNIQUE INDEX "cruise_emissions_daily_estimates_ship_id_date_method_version_key" ON "cruise_emissions_daily_estimates"("ship_id", "date", "method_version");

-- CreateIndex
CREATE INDEX "cruise_emissions_daily_estimates_date_idx" ON "cruise_emissions_daily_estimates"("date");

-- CreateIndex
CREATE INDEX "cruise_emissions_daily_estimates_ship_id_date_idx" ON "cruise_emissions_daily_estimates"("ship_id", "date");

-- AddForeignKey
ALTER TABLE "cruise_positions" ADD CONSTRAINT "cruise_positions_ship_id_fkey" FOREIGN KEY ("ship_id") REFERENCES "cruise_ships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruise_emissions_annual" ADD CONSTRAINT "cruise_emissions_annual_ship_id_fkey" FOREIGN KEY ("ship_id") REFERENCES "cruise_ships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cruise_emissions_daily_estimates" ADD CONSTRAINT "cruise_emissions_daily_estimates_ship_id_fkey" FOREIGN KEY ("ship_id") REFERENCES "cruise_ships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
