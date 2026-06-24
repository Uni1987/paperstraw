export const PRIVATE_JET_AIRCRAFT_TYPES = [
  "GLEX",
  "GLF4",
  "GLF5",
  "GLF6",
  "GLF7",
  "C25A",
  "C25B",
  "C25C",
  "C56X",
  "CL30",
  "CL35",
  "LJ45",
  "F2TH",
  "F900",
  "F2LX"
] as const;

const privateJetTypeSet = new Set<string>(PRIVATE_JET_AIRCRAFT_TYPES);

export function isLikelyPrivateJetType(aircraftType: string | null | undefined) {
  return privateJetTypeSet.has((aircraftType ?? "").trim().toUpperCase());
}

export function filterPrivateJetRecords<T extends { aircraftType: string }>(records: T[]) {
  return records.filter((record) => isLikelyPrivateJetType(record.aircraftType));
}
