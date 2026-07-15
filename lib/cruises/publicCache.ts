import { unstable_cache } from "next/cache";

export const PUBLIC_CRUISE_CACHE_REVALIDATE_SECONDS = 120;
export const PUBLIC_CRUISE_LAST_KNOWN_GOOD_SECONDS = 5 * 60;
export const PUBLIC_CRUISE_CACHE_MAX_BYTES = 1_500_000;

export const PUBLIC_CRUISE_CACHE_KEYS = ["dashboard", "map", "data-summary"] as const;
export type PublicCruiseCacheKey = (typeof PUBLIC_CRUISE_CACHE_KEYS)[number];

type CacheOptions = {
  revalidate: number;
  tags: string[];
};

export type PublicCruiseCacheFactory = <T>(
  loader: () => Promise<T>,
  keyParts: string[],
  options: CacheOptions
) => () => Promise<T>;

export function createPublicCruiseCache<T>(input: {
  key: PublicCruiseCacheKey;
  loader: () => Promise<T>;
  serialize: (value: T) => string;
  deserialize: (value: string) => T;
  cacheFactory?: PublicCruiseCacheFactory;
  now?: () => number;
}) {
  if (!isPublicCruiseCacheKey(input.key)) {
    throw new Error("Unsupported public Cruise cache key.");
  }
  const cacheFactory = input.cacheFactory ?? (unstable_cache as PublicCruiseCacheFactory);
  const now = input.now ?? Date.now;
  let lastKnownGood: { value: string; storedAt: number } | null = null;
  let refreshGeneration = 0;

  const cached = cacheFactory(
    async () => {
      const startedAt = now();
      const serialized = input.serialize(await input.loader());
      const payloadBytes = Buffer.byteLength(serialized, "utf8");
      if (payloadBytes > PUBLIC_CRUISE_CACHE_MAX_BYTES) {
        logPublicCruiseCacheEvent(input.key, "oversized", now() - startedAt, payloadBytes);
        throw new Error("Public Cruise cache payload exceeds its safety limit.");
      }
      refreshGeneration += 1;
      logPublicCruiseCacheEvent(input.key, "miss-refresh", now() - startedAt, payloadBytes);
      return serialized;
    },
    [`paperstraw-public-cruises-${input.key}-v1`],
    {
      revalidate: PUBLIC_CRUISE_CACHE_REVALIDATE_SECONDS,
      tags: [`paperstraw-public-cruises-${input.key}`]
    }
  );

  return async () => {
    try {
      const generationBeforeLoad = refreshGeneration;
      const serialized = await cached();
      const value = input.deserialize(serialized);
      lastKnownGood = { value: serialized, storedAt: now() };
      if (generationBeforeLoad === refreshGeneration) {
        logPublicCruiseCacheEvent(input.key, "hit", 0, Buffer.byteLength(serialized, "utf8"));
      }
      return value;
    } catch {
      const ageMs = lastKnownGood ? now() - lastKnownGood.storedAt : Number.POSITIVE_INFINITY;
      if (lastKnownGood && ageMs <= PUBLIC_CRUISE_LAST_KNOWN_GOOD_SECONDS * 1000) {
        logPublicCruiseCacheEvent(input.key, "last-known-good", ageMs, Buffer.byteLength(lastKnownGood.value, "utf8"));
        return input.deserialize(lastKnownGood.value);
      }
      logPublicCruiseCacheEvent(input.key, "unavailable", 0, 0);
      throw new Error("Cruise data is temporarily unavailable.");
    }
  };
}

function isPublicCruiseCacheKey(value: string): value is PublicCruiseCacheKey {
  return PUBLIC_CRUISE_CACHE_KEYS.includes(value as PublicCruiseCacheKey);
}

function logPublicCruiseCacheEvent(
  key: PublicCruiseCacheKey,
  cacheStatus: "hit" | "miss-refresh" | "last-known-good" | "oversized" | "unavailable",
  durationMs: number,
  payloadBytes: number
) {
  const event = JSON.stringify({
    event: "paperstraw.cruises.public-cache",
    operation: key,
    cacheStatus,
    durationMs: Math.max(0, Math.round(durationMs)),
    payloadBytes: Math.max(0, Math.round(payloadBytes))
  });
  if (cacheStatus === "hit") {
    if (process.env.CRUISE_QUERY_TIMING === "true") console.info(event);
    return;
  }
  if (cacheStatus === "miss-refresh") {
    console.info(event);
    return;
  }
  console.warn(event);
}
