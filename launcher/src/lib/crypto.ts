/**
 * ZenOS E2E Encryption Library
 * PBKDF2 key derivation + AES-GCM encryption for secure communications
 */

// Encryption configuration
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// Derive encryption key from password using PBKDF2
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

// Generate random salt
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

// Generate random IV
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

// Encrypt data using AES-GCM
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const iv = generateIV();
  const data = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return { ciphertext, iv };
}

// Decrypt data using AES-GCM
export async function decrypt(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Convert ArrayBuffer to base64 string
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 string to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert Uint8Array to base64
export function uint8ArrayToBase64(array: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

// Convert base64 to Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Generate ECDH key pair for key exchange
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

// Export public key to JWK format
export async function exportPublicKey(publicKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", publicKey);
}

// Import public key from JWK format
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

// Derive shared secret from ECDH key exchange
export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// High-level message encryption
export async function encryptMessage(
  message: string,
  sharedKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const { ciphertext, iv } = await encrypt(message, sharedKey);
  return {
    encrypted: arrayBufferToBase64(ciphertext),
    iv: uint8ArrayToBase64(iv),
  };
}

// High-level message decryption
export async function decryptMessage(
  encryptedData: { encrypted: string; iv: string },
  sharedKey: CryptoKey
): Promise<string> {
  const ciphertext = base64ToArrayBuffer(encryptedData.encrypted);
  const iv = base64ToUint8Array(encryptedData.iv);
  return decrypt(ciphertext, sharedKey, iv);
}

// Session key management for calls
export class CallEncryption {
  private keyPair: CryptoKeyPair | null = null;
  private sharedKey: CryptoKey | null = null;
  private isInitialized = false;

  async initialize(): Promise<JsonWebKey> {
    this.keyPair = await generateKeyPair();
    this.isInitialized = true;
    return exportPublicKey(this.keyPair.publicKey);
  }

  async setRemotePublicKey(remoteJwk: JsonWebKey): Promise<void> {
    if (!this.keyPair) {
      throw new Error("Key pair not initialized");
    }
    const remotePublicKey = await importPublicKey(remoteJwk);
    this.sharedKey = await deriveSharedKey(this.keyPair.privateKey, remotePublicKey);
  }

  async encryptData(data: string): Promise<{ encrypted: string; iv: string }> {
    if (!this.sharedKey) {
      throw new Error("Shared key not established");
    }
    return encryptMessage(data, this.sharedKey);
  }

  async decryptData(encryptedData: { encrypted: string; iv: string }): Promise<string> {
    if (!this.sharedKey) {
      throw new Error("Shared key not established");
    }
    return decryptMessage(encryptedData, this.sharedKey);
  }

  isReady(): boolean {
    return this.isInitialized && this.sharedKey !== null;
  }

  destroy(): void {
    this.keyPair = null;
    this.sharedKey = null;
    this.isInitialized = false;
  }
}

// Create a secure session ID
export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash data with SHA-256
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return arrayBufferToBase64(buffer);
}
