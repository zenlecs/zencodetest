import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit NIST standard for GCM
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

// Persistent device-bound encryption key
let _encryptionKey: Buffer | null = null;
let _legacyKdfKey: Buffer | null = null;

export function initializeCrypto(customSecret?: string): void {
  const secret = customSecret || process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET;
  
  if (secret && secret.length >= 32) {
    _encryptionKey = crypto.scryptSync(secret, "zenOS-master-kdf-salt-v1", KEY_LENGTH);
    _legacyKdfKey = crypto.scryptSync(secret, "zenOS-encryption-v1", KEY_LENGTH);
    console.log("[crypto] Encryption key initialized from environment successfully");
    return;
  }

  // Persistent disk-persisted key in user's secure application storage (prevents data loss across restarts)
  const basePath = process.env.ZENLECS_DATA_PATH || process.cwd();
  const keyFilePath = path.join(basePath, ".zen_device_key");

  if (fs.existsSync(keyFilePath)) {
    _encryptionKey = fs.readFileSync(keyFilePath);
  } else {
    _encryptionKey = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyFilePath, _encryptionKey, { mode: 0o600 });
  }

  console.log("[crypto] Device-persistent master key initialized successfully.");
}

function getEncryptionKey(): Buffer {
  if (!_encryptionKey) {
    // Attempt lazy initialization
    initializeCrypto();
  }
  return _encryptionKey!;
}

// AES-256-GCM encryption
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const tag = cipher.getAuthTag();
  
  // Return IV + Tag + Encrypted data (all hex encoded)
  return iv.toString("hex") + tag.toString("hex") + encrypted;
}

// AES-256-GCM decryption with backward-compatible legacy 16-byte IV support
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  
  // Standard 12-byte IV (96-bit NIST standard)
  try {
    const iv = Buffer.from(encryptedText.slice(0, IV_LENGTH * 2), "hex");
    const tag = Buffer.from(encryptedText.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), "hex");
    const encrypted = encryptedText.slice((IV_LENGTH + TAG_LENGTH) * 2);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err12) {
    // Backward compatibility fallback for legacy 16-byte IV
    const LEGACY_IV_LEN = 16;
    try {
      const iv = Buffer.from(encryptedText.slice(0, LEGACY_IV_LEN * 2), "hex");
      const tag = Buffer.from(encryptedText.slice(LEGACY_IV_LEN * 2, (LEGACY_IV_LEN + TAG_LENGTH) * 2), "hex");
      const encrypted = encryptedText.slice((LEGACY_IV_LEN + TAG_LENGTH) * 2);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
        } catch {
      // Further fallback: try legacy KDF salt key (from Round 1) if present
      if (_legacyKdfKey) {
        // Try legacy KDF key with 16-byte IV (Round 1 format)
        const LEGACY_IV_LEN = 16;
        try {
          const iv16 = Buffer.from(encryptedText.slice(0, LEGACY_IV_LEN * 2), "hex");
          const tag16 = Buffer.from(encryptedText.slice(LEGACY_IV_LEN * 2, (LEGACY_IV_LEN + TAG_LENGTH) * 2), "hex");
          const enc16 = encryptedText.slice((LEGACY_IV_LEN + TAG_LENGTH) * 2);
          const decipherLegacy16 = crypto.createDecipheriv(ALGORITHM, _legacyKdfKey, iv16);
          decipherLegacy16.setAuthTag(tag16);
          let d = decipherLegacy16.update(enc16, "hex", "utf8");
          d += decipherLegacy16.final("utf8");
          return d;
        } catch {}

        // Try legacy KDF key with 12-byte IV
        try {
          const iv12 = Buffer.from(encryptedText.slice(0, 12 * 2), "hex");
          const tag12 = Buffer.from(encryptedText.slice(12 * 2, (12 + TAG_LENGTH) * 2), "hex");
          const enc12 = encryptedText.slice((12 + TAG_LENGTH) * 2);
          const decipherLegacy12 = crypto.createDecipheriv(ALGORITHM, _legacyKdfKey, iv12);
          decipherLegacy12.setAuthTag(tag12);
          let d = decipherLegacy12.update(enc12, "hex", "utf8");
          d += decipherLegacy12.final("utf8");
          return d;
        } catch {}
      }
      throw err12;
    }
  }
}

// Hash authKey with bcrypt-like approach using scrypt (Server-side hash of client-derived key)
export async function hashAuthKey(authKey: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.scryptSync(authKey, salt, KEY_LENGTH);
  return salt.toString("hex") + ":" + hash.toString("hex");
}

// Verify authKey
export async function verifyAuthKey(authKey: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  
  const salt = Buffer.from(saltHex, "hex");
  const storedHashBuffer = Buffer.from(hashHex, "hex");
  const hash = crypto.scryptSync(authKey, salt, KEY_LENGTH);
  
  return crypto.timingSafeEqual(hash, storedHashBuffer);
}

// Generate session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Hash session token for storage
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Generate CSRF token
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Generate 2FA secret
export function generate2FASecret(): string {
  return crypto.randomBytes(20).toString("hex");
}

// ZKA Note: RSA E2E helpers retired in favor of client-side libsodium / WebCrypto

// Generate random ID
export function generateId(): string {
  return crypto.randomUUID();
}

// Encrypt wallet private key with user's master key using random salt
export function encryptWalletKey(privateKey: string, userMasterKey: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(userMasterKey, salt, KEY_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(privateKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const tag = cipher.getAuthTag();
  // Return Salt + IV + Tag + Encrypted data
  return salt.toString("hex") + iv.toString("hex") + tag.toString("hex") + encrypted;
}

// Decrypt wallet private key
export function decryptWalletKey(encryptedPayload: string, userMasterKey: string): string {
  // 1. Try standard format: 16-byte random salt (32 hex) + 12-byte IV (24 hex) + 16-byte Tag (32 hex) + encrypted
  try {
    const salt = Buffer.from(encryptedPayload.slice(0, 32), "hex");
    const iv = Buffer.from(encryptedPayload.slice(32, 32 + IV_LENGTH * 2), "hex");
    const tag = Buffer.from(encryptedPayload.slice(32 + IV_LENGTH * 2, 32 + (IV_LENGTH + TAG_LENGTH) * 2), "hex");
    const encrypted = encryptedPayload.slice(32 + (IV_LENGTH + TAG_LENGTH) * 2);

    const key = crypto.scryptSync(userMasterKey, salt, KEY_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (errCurrent) {
    // 2. Fallback: try legacy format with static "wallet-salt" and 16-byte IV
    try {
      const LEGACY_IV_LEN = 16;
      const iv = Buffer.from(encryptedPayload.slice(0, LEGACY_IV_LEN * 2), "hex");
      const tag = Buffer.from(encryptedPayload.slice(LEGACY_IV_LEN * 2, (LEGACY_IV_LEN + TAG_LENGTH) * 2), "hex");
      const encrypted = encryptedPayload.slice((LEGACY_IV_LEN + TAG_LENGTH) * 2);

      const legacyKey = crypto.scryptSync(userMasterKey, "wallet-salt", KEY_LENGTH);
      const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      throw errCurrent;
    }
  }
}

// ZKA NOTE: .enc file logic is now fully handled on the client-side via WebCrypto API.
// The server only stores the vault payload as an opaque text blob.

// Re-encryption utility: Takes any valid payload (from Round 1, 2, 3, or 4),
// decrypts it through the backward-compatible fallback chain,
// and re-encrypts it in the current standard format (12-byte IV + current master key).
export function reencryptToCurrent(encryptedText: string): string {
  const plaintext = decrypt(encryptedText);
  return encrypt(plaintext);
}
