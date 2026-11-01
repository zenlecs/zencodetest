import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { bech32 } from "@scure/base";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ethers } from "ethers";

export interface DerivedWallet {
  currency: string;
  name: string;
  address: string;
  privateKey: string;
  derivationPath: string;
  icon: string;
  color: string;
}

export interface WalletVault {
  mnemonic: string;
  wallets: DerivedWallet[];
  createdAt: string;
}

const SUPPORTED_TOKENS = [
  { code: "ETH", name: "Ethereum", path: "m/44'/60'/0'/0/0", icon: "Ξ", color: "from-violet-500 to-purple-500" },
  { code: "BTC", name: "Bitcoin", path: "m/44'/0'/0'/0/0", icon: "₿", color: "from-amber-500 to-orange-500" },
  { code: "USDT", name: "Tether (ERC-20)", path: "m/44'/60'/0'/0/1", icon: "₮", color: "from-emerald-500 to-green-500" },
  { code: "USDC", name: "USD Coin (ERC-20)", path: "m/44'/60'/0'/0/2", icon: "$", color: "from-blue-500 to-cyan-500" },
  { code: "BNB", name: "BNB (BEP-20)", path: "m/44'/60'/0'/0/3", icon: "B", color: "from-yellow-500 to-amber-500" },
  { code: "MATIC", name: "Polygon", path: "m/44'/60'/0'/0/4", icon: "M", color: "from-purple-500 to-indigo-500" },
  { code: "AVAX", name: "Avalanche", path: "m/44'/60'/0'/0/5", icon: "A", color: "from-red-500 to-rose-500" },
  { code: "ARB", name: "Arbitrum", path: "m/44'/60'/0'/0/6", icon: "A", color: "from-blue-600 to-indigo-600" },
];

export function generateNewMnemonic(strength: 12 | 24 = 12): string {
  const bits = strength === 12 ? 128 : 256;
  return generateMnemonic(wordlist, bits);
}

export function validateSeedPhrase(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

export async function deriveWalletsFromMnemonic(
  mnemonic: string,
  selectedTokens: string[] = ["ETH", "BTC", "USDT"]
): Promise<DerivedWallet[]> {
  if (!validateSeedPhrase(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const wallets: DerivedWallet[] = [];

  for (const token of SUPPORTED_TOKENS) {
    if (!selectedTokens.includes(token.code)) continue;

    const derived = hdKey.derive(token.path);
    
    if (!derived.privateKey) {
      throw new Error(`Failed to derive private key for ${token.code}`);
    }

    let address: string;
    const privateKeyHex = bytesToHex(derived.privateKey);

    if (token.code === "BTC") {
      address = deriveBitcoinAddress(derived.publicKey!);
    } else {
      const wallet = new ethers.Wallet(privateKeyHex);
      address = wallet.address;
    }

    wallets.push({
      currency: token.code,
      name: token.name,
      address,
      privateKey: privateKeyHex,
      derivationPath: token.path,
      icon: token.icon,
      color: token.color,
    });
  }

  return wallets;
}

function bytesToHex(bytes: Uint8Array, withPrefix: boolean = true): string {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return withPrefix ? "0x" + hex : hex;
}

function deriveBitcoinAddress(publicKey: Uint8Array): string {
  const sha256Hash = sha256(publicKey);
  const hash160 = ripemd160(sha256Hash);
  const words = bech32.toWords(hash160);
  words.unshift(0);
  return bech32.encode("bc", words);
}

export async function encryptVault(vault: WalletVault, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(vault));
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode.apply(null, Array.from(combined)));
}

export async function decryptVault(encryptedData: string, password: string): Promise<WalletVault> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return JSON.parse(decoder.decode(decrypted));
}

export function downloadEncryptedBackup(encryptedData: string, filename: string = "zenwallet-backup"): void {
  const blob = new Blob([encryptedData], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.enc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readEncryptedBackup(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

const VAULT_STORAGE_KEY = "zenwallet_vault";

export async function saveVaultToStorage(vault: WalletVault, password: string): Promise<void> {
  const encrypted = await encryptVault(vault, password);
  localStorage.setItem(VAULT_STORAGE_KEY, encrypted);
}

export async function loadVaultFromStorage(password: string): Promise<WalletVault | null> {
  const encrypted = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!encrypted) return null;
  
  try {
    return await decryptVault(encrypted, password);
  } catch {
    throw new Error("Invalid password or corrupted vault");
  }
}

export function hasStoredVault(): boolean {
  return localStorage.getItem(VAULT_STORAGE_KEY) !== null;
}

export function clearStoredVault(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
}

export function getRandomVerificationIndices(total: number = 12, count: number = 3): number[] {
  const indices: number[] = [];
  while (indices.length < count) {
    const idx = Math.floor(Math.random() * total);
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }
  return indices.sort((a, b) => a - b);
}

export const AVAILABLE_TOKENS = SUPPORTED_TOKENS;
