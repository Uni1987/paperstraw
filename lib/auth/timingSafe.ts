const MAX_AUTH_TOKEN_BYTES = 4096;

export async function timingSafeEqual(value: string, expected: string) {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  const expectedBytes = encoder.encode(expected);

  if (valueBytes.byteLength > MAX_AUTH_TOKEN_BYTES || expectedBytes.byteLength > MAX_AUTH_TOKEN_BYTES) {
    return false;
  }

  const [valueDigest, expectedDigest] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", valueBytes),
    globalThis.crypto.subtle.digest("SHA-256", expectedBytes)
  ]);
  const valueHash = new Uint8Array(valueDigest);
  const expectedHash = new Uint8Array(expectedDigest);
  let difference = valueBytes.byteLength ^ expectedBytes.byteLength;

  for (let index = 0; index < valueHash.byteLength; index += 1) {
    difference |= valueHash[index] ^ expectedHash[index];
  }

  return difference === 0;
}
