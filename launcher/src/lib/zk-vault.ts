import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { deriveKey, encrypt, decrypt, arrayBufferToBase64, base64ToArrayBuffer, generateSalt, generateIV, uint8ArrayToBase64, base64ToUint8Array } from "./crypto";

// Constants
const VAULT_MAGIC = "ZENOS-ZK-V1";

export interface ZKVault {
  magic: string;
  vaultId: string;
  userId?: number;
  salt: string; // Base64
  iv: string;   // Base64
  encryptedMasterKey: string; // Base64
  privateKeyEncrypted: string; // Base64
  privateKeyIv: string; // Base64
}

export interface UserKeys {
  masterKey: CryptoKey;
  authKey: string; // Sent to server
  publicKey: string; // Sent to server
  privateKey: CryptoKey; // Kept in memory
  vaultPayload: string; // Serialized ZKVault
}

/**
 * Derives a secondary key for Authentication Proof so we don't send the Master Key
 */
async function deriveAuthKey(password: string, salt: Uint8Array): Promise<string> {
  const authSalt = new Uint8Array(salt.length);
  for (let i = 0; i < salt.length; i++) authSalt[i] = salt[i] ^ 0x5a; // domain separation

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const authKeyBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: authSalt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return arrayBufferToBase64(authKeyBits);
}

/**
 * Generates an RSA-OAEP Key Pair for E2E Document/Message encryption.
 */
async function generateAsymmetricKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Creates a brand new Zero-Knowledge Vault for Registration.
 */
export async function createRegistrationVault(password: string): Promise<{ keys: UserKeys, recoveryPhrase: string }> {
  // 1. Generate salt and derive Key Encryption Key (KEK)
  const salt = generateSalt();
  const kek = await deriveKey(password, salt);
  
  // Derive Auth Key
  const authKey = await deriveAuthKey(password, salt);

  // 2. Generate True Master Key
  const trueMasterKeyRaw = crypto.getRandomValues(new Uint8Array(32));
  const masterKey = await crypto.subtle.importKey(
    "raw",
    trueMasterKeyRaw,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );

  // Encrypt True Master Key with KEK
  const masterKeyBuffer = await crypto.subtle.exportKey("raw", masterKey);
  const kekIv = generateIV();
  const encryptedMasterKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: kekIv },
    kek,
    masterKeyBuffer
  );

  // 3. Generate Asymmetric Key Pair
  const keyPair = await generateAsymmetricKeyPair();
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const publicKeyStr = JSON.stringify(publicKeyJwk);

  // Export and encrypt Private Key with True Master Key
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const { ciphertext: privateKeyEncrypted, iv: privateKeyIv } = await encrypt(
    JSON.stringify(privateKeyJwk),
    masterKey
  );

  const vaultId = crypto.randomUUID();

  const vault: ZKVault = {
    magic: VAULT_MAGIC,
    vaultId,
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(kekIv),
    encryptedMasterKey: arrayBufferToBase64(encryptedMasterKey),
    privateKeyEncrypted: arrayBufferToBase64(privateKeyEncrypted),
    privateKeyIv: uint8ArrayToBase64(privateKeyIv),
  };

  const recoveryPhrase = generateMnemonic(wordlist, 256); // 24 words

  return {
    keys: {
      masterKey,
      authKey,
      publicKey: publicKeyStr,
      privateKey: keyPair.privateKey,
      vaultPayload: JSON.stringify(vault),
    },
    recoveryPhrase
  };
}

/**
 * Unlocks a Vault using a password.
 */
export async function unlockVault(vaultPayload: string, password: string): Promise<UserKeys> {
  const vault: ZKVault = JSON.parse(vaultPayload);
  
  if (vault.magic !== VAULT_MAGIC) {
    throw new Error("Geçersiz kasa dosyası formatı.");
  }

  const salt = base64ToUint8Array(vault.salt);
  
  // 1. Derive KEK and AuthKey
  const kek = await deriveKey(password, salt);
  const authKey = await deriveAuthKey(password, salt);

  try {
    // 2. Decrypt True Master Key
    const iv = base64ToUint8Array(vault.iv);
    const encryptedMk = base64ToArrayBuffer(vault.encryptedMasterKey);
    
    const trueMasterKeyRaw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      kek,
      encryptedMk
    );

    const masterKey = await crypto.subtle.importKey(
      "raw",
      trueMasterKeyRaw,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );

    // 3. Decrypt Private Key
    const privIv = base64ToUint8Array(vault.privateKeyIv);
    const privCipher = base64ToArrayBuffer(vault.privateKeyEncrypted);
    
    const decryptedPrivJwkBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: privIv },
      masterKey,
      privCipher
    );
    
    const decoder = new TextDecoder();
    const privateKeyJwk = JSON.parse(decoder.decode(decryptedPrivJwkBytes));
    
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );

    return {
      masterKey,
      authKey,
      publicKey: "", // To be fetched or extracted
      privateKey,
      vaultPayload,
    };
  } catch (err) {
    console.error("Vault unlock failed:", err);
    throw new Error("Şifre hatalı veya kasa dosyası bozuk.");
  }
}

let activeUserKeys: UserKeys | null = null;

export function setActiveUserKeys(keys: UserKeys | null) {
  activeUserKeys = keys;
}

export function getActiveUserKeys(): UserKeys | null {
  return activeUserKeys;
}

export async function encryptDataPayload(data: any): Promise<string> {
  const keys = getActiveUserKeys();
  if (!keys) throw new Error("No active keys for encryption. Vault might be locked.");
  const { ciphertext, iv } = await encrypt(JSON.stringify(data), keys.masterKey);
  return JSON.stringify({
    cipher: arrayBufferToBase64(ciphertext),
    iv: uint8ArrayToBase64(iv)
  });
}

export async function decryptDataPayload(payload: string): Promise<any> {
  const keys = getActiveUserKeys();
  if (!keys) {
    console.warn("Cannot decrypt payload: No active keys.");
    return {};
  }
  try {
    const { cipher, iv } = JSON.parse(payload);
    const decryptedStr = await decrypt(
      base64ToArrayBuffer(cipher),
      keys.masterKey,
      base64ToUint8Array(iv)
    );
    return JSON.parse(decryptedStr);
  } catch(e) {
    console.error("Failed to decrypt payload", e);
    return {};
  }
}

export async function encryptP2PMessage(data: string, recipientPublicKeyJwkStr: string): Promise<string> {
  const keys = getActiveUserKeys();
  if (!keys) throw new Error("No active keys");

  const sessionKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    encoder.encode(data)
  );

  const rawSessionKey = await crypto.subtle.exportKey("raw", sessionKey);

  const recipientJwk = JSON.parse(recipientPublicKeyJwkStr);
  const recipientPublicKey = await crypto.subtle.importKey(
    "jwk",
    recipientJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const encryptedKeyForRecipient = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawSessionKey
  );

  const senderJwk = JSON.parse(keys.publicKey);
  const senderPublicKey = await crypto.subtle.importKey(
    "jwk",
    senderJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const encryptedKeyForSender = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    senderPublicKey,
    rawSessionKey
  );

  return JSON.stringify({
    cipher: arrayBufferToBase64(ciphertext),
    iv: uint8ArrayToBase64(iv),
    encryptedKeyForRecipient: arrayBufferToBase64(encryptedKeyForRecipient),
    encryptedKeyForSender: arrayBufferToBase64(encryptedKeyForSender)
  });
}

export async function decryptP2PMessage(payloadStr: string, senderPublicKeyJwkStr: string): Promise<string> {
  const keys = getActiveUserKeys();
  if (!keys) throw new Error("No active keys");

  const payload = JSON.parse(payloadStr);

  const isSender = keys.publicKey === senderPublicKeyJwkStr;
  const encryptedKeyStr = isSender ? payload.encryptedKeyForSender : payload.encryptedKeyForRecipient;

  if (!encryptedKeyStr) throw new Error("No encrypted key found for user");

  const encryptedKeyBuffer = base64ToArrayBuffer(encryptedKeyStr);
  const rawSessionKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    keys.privateKey,
    encryptedKeyBuffer
  );

  const sessionKey = await crypto.subtle.importKey(
    "raw",
    rawSessionKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const ciphertext = base64ToArrayBuffer(payload.cipher);
  const iv = base64ToUint8Array(payload.iv);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sessionKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
