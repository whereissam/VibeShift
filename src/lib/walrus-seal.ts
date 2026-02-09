/**
 * Walrus Seal — AES-256-GCM encryption for VibeShift reasoning proofs.
 *
 * Encrypts strategy proofs before uploading to Walrus so on-chain blob IDs
 * are opaque. Authorized auditors/depositors can decrypt with the master
 * secret. Uses Web Crypto API — zero external dependencies.
 *
 * Key derivation: HKDF-SHA256(masterSecret, salt=vaultId, info="vibeshift-seal-v1")
 */

import { WALRUS_PUBLISHER, WALRUS_AGGREGATOR } from "./constants";

// ===== Types =====

export interface ProofPlaintext {
  timestamp: string;
  vault_id: string;
  direction: string;
  shift_pct: number;
  shift_amount: string;
  reason: string;
  cetus_yield_bps: number;
  stablelayer_yield_bps: number;
}

export interface EncryptedProofPayload {
  /** Encryption version (1 = AES-256-GCM + HKDF-SHA256) */
  v: number;
  /** Base64-encoded 12-byte IV */
  iv: string;
  /** Base64-encoded ciphertext (includes GCM auth tag) */
  ct: string;
  /** Seal policy ID for future Walrus Seal native integration */
  policy: string;
}

export interface EncryptedUploadResult {
  walrusBlobId: string;
  sealPolicyId: string;
  encryptionVersion: number;
}

// ===== Constants =====

const ENCRYPTION_VERSION = 1;
const HKDF_INFO = "vibeshift-seal-v1";
const IV_BYTES = 12;

// ===== Helpers =====

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derive a per-vault AES-256-GCM key from a master secret via HKDF-SHA256.
 */
async function deriveKey(
  masterSecret: string,
  vaultId: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import master secret as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  // Derive AES-256-GCM key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(vaultId),
      info: encoder.encode(HKDF_INFO),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Generate a seal policy ID from the vault ID.
 * In v2, this will be a Walrus Seal native policy object ID.
 * For v1, we derive a deterministic identifier.
 */
function deriveSealPolicyId(vaultId: string): string {
  return `vibeshift-seal-v1:${vaultId}`;
}

// ===== Public API =====

/**
 * Encrypt a proof plaintext into an EncryptedProofPayload.
 */
export async function encryptProof(
  proof: ProofPlaintext,
  masterSecret: string,
  vaultId: string,
): Promise<EncryptedProofPayload> {
  const key = await deriveKey(masterSecret, vaultId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(proof));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  return {
    v: ENCRYPTION_VERSION,
    iv: toBase64(iv.buffer),
    ct: toBase64(ciphertext),
    policy: deriveSealPolicyId(vaultId),
  };
}

/**
 * Decrypt an EncryptedProofPayload back to ProofPlaintext.
 */
export async function decryptProof(
  payload: EncryptedProofPayload,
  masterSecret: string,
  vaultId: string,
): Promise<ProofPlaintext> {
  if (payload.v !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version: ${payload.v}`);
  }

  const key = await deriveKey(masterSecret, vaultId);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ct);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  const json = new TextDecoder().decode(plaintext);
  return JSON.parse(json) as ProofPlaintext;
}

/**
 * Encrypt a proof and upload to Walrus. Returns blob ID, seal policy, and version.
 */
export async function encryptAndUploadProof(
  proof: ProofPlaintext,
  masterSecret: string,
  vaultId: string,
  epochs = 5,
): Promise<EncryptedUploadResult> {
  const encrypted = await encryptProof(proof, masterSecret, vaultId);
  const body = JSON.stringify(encrypted);

  const response = await fetch(
    `${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`,
    { method: "PUT", body },
  );

  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const newlyCreated = data.newlyCreated as
    | Record<string, unknown>
    | undefined;
  const alreadyCertified = data.alreadyCertified as
    | Record<string, unknown>
    | undefined;

  let walrusBlobId: string;
  if (newlyCreated) {
    const blobObject = newlyCreated.blobObject as Record<string, unknown>;
    walrusBlobId = String(blobObject.blobId);
  } else if (alreadyCertified) {
    walrusBlobId = String(alreadyCertified.blobId);
  } else {
    throw new Error("Unexpected Walrus response format");
  }

  return {
    walrusBlobId,
    sealPolicyId: encrypted.policy,
    encryptionVersion: ENCRYPTION_VERSION,
  };
}

/**
 * Download an encrypted proof from Walrus and decrypt it.
 */
export async function downloadAndDecryptProof(
  walrusBlobId: string,
  masterSecret: string,
  vaultId: string,
): Promise<ProofPlaintext> {
  const response = await fetch(
    `${WALRUS_AGGREGATOR}/v1/blobs/${walrusBlobId}`,
  );

  if (!response.ok) {
    throw new Error(`Walrus download failed: ${response.status}`);
  }

  const payload = (await response.json()) as EncryptedProofPayload;
  return decryptProof(payload, masterSecret, vaultId);
}
