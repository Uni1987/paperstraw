export const EMISSIONS_FACTORS = {
  transport: {
    averagePassengerCarKgCo2PerKm: 0.192,
    amsterdamNewYorkReturnFlightTonnesCo2: 1.6,
    railKgCo2PerPassengerKm: 0.041,
    earthCircumferenceKm: 40075,
    gasolineKgCo2PerLiter: 2.31
  },
  households: {
    annualElectricityTonnesCo2: 1.5,
    hotShowerKgCo2: 1.5,
    annualFootprintTonnesCo2: 4.6
  },
  nature: {
    treeAbsorptionKgCo2PerYear: 22,
    lifetimeTreeAbsorptionTonnesCo2: 1,
    footballFieldM2: 7140,
    forestAbsorptionTonnesCo2PerHectareYear: 10,
    hectareM2: 10000
  },
  products: {
    hamburgerKgCo2: 3,
    coffeeCupKgCo2: 0.05,
    smartphoneKgCo2: 70,
    cottonTshirtKgCo2: 4
  }
} as const;
