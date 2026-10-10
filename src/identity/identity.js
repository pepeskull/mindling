const ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });

const toHex = bytes => [...bytes].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();

export async function createLocalIdentity() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  const keyPair = await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("jwk", keyPair.privateKey)
  ]);
  const canonicalPublicKey = JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x, y: publicKey.y });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPublicKey)));
  const hex = toHex(digest.slice(0, 6));
  return {
    id: "local-identity",
    mindlingId: `ML-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`,
    publicKey,
    privateKey,
    algorithm: { ...ALGORITHM, hash: "SHA-256", format: "JWK" },
    createdAt: new Date().toISOString()
  };
}
