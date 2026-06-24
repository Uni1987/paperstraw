import { EMISSIONS_FACTORS } from "./emissionsFactors";
import { formatCompactNumber } from "./format";

export type ComparisonCategory = "Everyday Life" | "Households" | "Nature" | "Everyday Products";

export type ComparisonCardData = {
  id: string;
  category: ComparisonCategory;
  icon: string;
  title: string;
  value: string;
  unit: string;
  description: string;
  sourceAssumption: string;
  factorLabel: string;
  formulaLabel: string;
  showOnHomepage: boolean;
  extraMetrics?: Array<{
    label: string;
    value: string;
  }>;
};

export type ForestAreaResult = {
  hectares: number;
  squareKilometers: number;
  footballFields: number;
};

export const COMPARISON_CATEGORIES: ComparisonCategory[] = ["Everyday Life", "Households", "Nature", "Everyday Products"];

export function calculateDrivingDistance(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.transport.averagePassengerCarKgCo2PerKm;
}

export function calculateFlights(co2Tons: number) {
  return co2Tons / EMISSIONS_FACTORS.transport.amsterdamNewYorkReturnFlightTonnesCo2;
}

export function calculateTrainJourneys(co2Tons: number) {
  return (kg(co2Tons) / EMISSIONS_FACTORS.transport.railKgCo2PerPassengerKm) / EMISSIONS_FACTORS.transport.earthCircumferenceKm;
}

export function calculateGasolineLiters(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.transport.gasolineKgCo2PerLiter;
}

export function calculateHouseholdElectricity(co2Tons: number) {
  return co2Tons / EMISSIONS_FACTORS.households.annualElectricityTonnesCo2;
}

export function calculateHotShowers(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.households.hotShowerKgCo2;
}

export function calculateHouseholds(co2Tons: number) {
  return co2Tons / EMISSIONS_FACTORS.households.annualFootprintTonnesCo2;
}

export function calculateForestFields(co2Tons: number) {
  return calculateForestArea(co2Tons).footballFields;
}

export function calculateForestArea(co2Tons: number): ForestAreaResult {
  const hectares = co2Tons / EMISSIONS_FACTORS.nature.forestAbsorptionTonnesCo2PerHectareYear;
  return {
    hectares,
    squareKilometers: hectares / 100,
    footballFields: (hectares * EMISSIONS_FACTORS.nature.hectareM2) / EMISSIONS_FACTORS.nature.footballFieldM2
  };
}

export function calculateLifetimeTrees(co2Tons: number) {
  return co2Tons / EMISSIONS_FACTORS.nature.lifetimeTreeAbsorptionTonnesCo2;
}

export function calculateHamburgers(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.products.hamburgerKgCo2;
}

export function calculateCoffeeCups(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.products.coffeeCupKgCo2;
}

export function calculateSmartphones(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.products.smartphoneKgCo2;
}

export function calculateTshirts(co2Tons: number) {
  return kg(co2Tons) / EMISSIONS_FACTORS.products.cottonTshirtKgCo2;
}

export function buildComparisonCards(co2Tons: number): ComparisonCardData[] {
  const forestArea = calculateForestArea(co2Tons);

  return [
    card({
      id: "driving-distance",
      category: "Everyday Life",
      icon: "🚗",
      title: "Driving distance",
      value: calculateDrivingDistance(co2Tons),
      unit: "km",
      description: "Equivalent to driving X million kilometers in an average gasoline-powered car.",
      sourceAssumption: "Average gasoline-powered passenger car emissions.",
      factorLabel: "0.192 kg CO2 per km",
      formulaLabel: "(CO2 tonnes * 1000) / 0.192"
    }),
    card({
      id: "amsterdam-new-york-flights",
      category: "Everyday Life",
      icon: "✈️",
      title: "Amsterdam-New York flights",
      value: calculateFlights(co2Tons),
      unit: "return flights",
      description: "Equivalent to X return flights between Amsterdam and New York.",
      sourceAssumption: "Average passenger return trip emissions for Amsterdam-New York.",
      factorLabel: "1.6 t CO2 per passenger return trip",
      formulaLabel: "CO2 tonnes / 1.6"
    }),
    card({
      id: "train-journeys-around-earth",
      category: "Everyday Life",
      icon: "🚆",
      title: "Train journeys around Earth",
      value: calculateTrainJourneys(co2Tons),
      unit: "times around Earth",
      description: "Equivalent to travelling around the Earth by train X times.",
      sourceAssumption: "Modern electric/intercity rail and Earth's approximate circumference.",
      factorLabel: "0.041 kg CO2 per passenger-km; Earth circumference 40,075 km",
      formulaLabel: "((CO2 tonnes * 1000) / 0.041) / 40075"
    }),
    card({
      id: "gasoline-consumed",
      category: "Everyday Life",
      icon: "⛽",
      title: "Gasoline consumed",
      value: calculateGasolineLiters(co2Tons),
      unit: "liters",
      description: "Equivalent to burning X million liters of gasoline.",
      sourceAssumption: "Average tailpipe CO2 from gasoline combustion.",
      factorLabel: "2.31 kg CO2 per liter",
      formulaLabel: "(CO2 tonnes * 1000) / 2.31"
    }),
    card({
      id: "household-electricity",
      category: "Households",
      icon: "💡",
      title: "Household electricity use",
      value: calculateHouseholdElectricity(co2Tons),
      unit: "households",
      description: "Equivalent to the annual electricity consumption of X households.",
      sourceAssumption: "Average annual household electricity emissions.",
      factorLabel: "1.5 t CO2 per household per year",
      formulaLabel: "CO2 tonnes / 1.5"
    }),
    card({
      id: "hot-showers",
      category: "Households",
      icon: "🚿",
      title: "Hot showers",
      value: calculateHotShowers(co2Tons),
      unit: "showers",
      description: "Equivalent to X million hot showers.",
      sourceAssumption: "Average emissions for one hot shower.",
      factorLabel: "1.5 kg CO2 per shower",
      formulaLabel: "(CO2 tonnes * 1000) / 1.5"
    }),
    card({
      id: "household-emissions",
      category: "Households",
      icon: "🏠",
      title: "Household emissions",
      value: calculateHouseholds(co2Tons),
      unit: "households",
      description: "Equivalent to the annual carbon footprint of a community with X households.",
      sourceAssumption: "Average annual household carbon footprint.",
      factorLabel: "4.6 t CO2 per household per year",
      formulaLabel: "CO2 tonnes / 4.6"
    }),
    card({
      id: "forest-fields",
      category: "Nature",
      icon: "🌳",
      title: "Forest area required",
      value: calculateForestFields(co2Tons),
      unit: "football fields",
      description: "You would need a forest covering X football fields to offset these emissions annually.",
      sourceAssumption: "Average annual forest carbon absorption and football field area.",
      factorLabel: "10 t CO2 per hectare per year; 7,140 m2 per football field",
      formulaLabel: "hectares = CO2 tonnes / 10; fields = (hectares * 10000) / 7140",
      extraMetrics: forestMetrics(forestArea)
    }),
    card({
      id: "lifetime-trees",
      category: "Nature",
      icon: "🌲",
      title: "Trees over their lifetime",
      value: calculateLifetimeTrees(co2Tons),
      unit: "trees",
      description: "Equivalent to the total lifetime carbon absorption of X mature trees.",
      sourceAssumption: "Simplified lifetime absorption per mature tree.",
      factorLabel: "1 t CO2 per tree lifetime",
      formulaLabel: "CO2 tonnes / 1"
    }),
    card({
      id: "forest-area-comparison",
      category: "Nature",
      icon: "🌍",
      title: "Forest area comparison",
      value: forestArea.squareKilometers,
      unit: "km2",
      description: "Equivalent to a forested area of X square kilometers.",
      sourceAssumption: "Average annual forest carbon absorption.",
      factorLabel: "10 t CO2 per hectare per year; 100 hectares per km2",
      formulaLabel: "hectares = CO2 tonnes / 10; km2 = hectares / 100",
      extraMetrics: forestMetrics(forestArea)
    }),
    card({
      id: "hamburgers",
      category: "Everyday Products",
      icon: "🍔",
      title: "Hamburgers",
      value: calculateHamburgers(co2Tons),
      unit: "hamburgers",
      description: "Equivalent to the emissions generated by producing X million hamburgers.",
      sourceAssumption: "Average production emissions per hamburger.",
      factorLabel: "3 kg CO2 per burger",
      formulaLabel: "(CO2 tonnes * 1000) / 3"
    }),
    card({
      id: "cups-of-coffee",
      category: "Everyday Products",
      icon: "☕",
      title: "Cups of coffee",
      value: calculateCoffeeCups(co2Tons),
      unit: "cups",
      description: "Equivalent to producing X billion cups of coffee.",
      sourceAssumption: "Average production emissions per cup of coffee.",
      factorLabel: "0.05 kg CO2 per cup",
      formulaLabel: "(CO2 tonnes * 1000) / 0.05"
    }),
    card({
      id: "smartphones-manufactured",
      category: "Everyday Products",
      icon: "📱",
      title: "Smartphones manufactured",
      value: calculateSmartphones(co2Tons),
      unit: "smartphones",
      description: "Equivalent to manufacturing X million smartphones.",
      sourceAssumption: "Average smartphone production emissions.",
      factorLabel: "70 kg CO2 per smartphone",
      formulaLabel: "(CO2 tonnes * 1000) / 70"
    }),
    card({
      id: "cotton-tshirts",
      category: "Everyday Products",
      icon: "👕",
      title: "Cotton T-shirts",
      value: calculateTshirts(co2Tons),
      unit: "T-shirts",
      description: "Equivalent to producing X million cotton T-shirts.",
      sourceAssumption: "Average production emissions per cotton T-shirt.",
      factorLabel: "4 kg CO2 per T-shirt",
      formulaLabel: "(CO2 tonnes * 1000) / 4"
    })
  ];
}

function card(input: Omit<ComparisonCardData, "value" | "showOnHomepage"> & { value: number; showOnHomepage?: boolean }): ComparisonCardData {
  return {
    ...input,
    value: formatComparisonValue(input.value),
    showOnHomepage: input.showOnHomepage ?? false
  };
}

function forestMetrics(area: ForestAreaResult) {
  return [
    { label: "Hectares", value: formatComparisonValue(area.hectares) },
    { label: "Square kilometers", value: formatComparisonValue(area.squareKilometers) },
    { label: "Football fields", value: formatComparisonValue(area.footballFields) }
  ];
}

function formatComparisonValue(value: number) {
  if (value < 1000) return new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  return formatCompactNumber(value);
}

function kg(co2Tons: number) {
  return co2Tons * 1000;
}
