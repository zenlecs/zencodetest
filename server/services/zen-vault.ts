import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * ZenVault: BitLocker-grade Zero-Knowledge Encrypted Storage Engine
 * 
 * Hardened Features:
 * 1. Scrypt KDF with N=131072 (2^17) for enhanced resistance against brute-force attacks.
 * 2. Key-Check Record (Token verifier) to strictly validate master passphrase on unlock.
 * 3. Strict regex validation for blobId (/^[a-f0-9]{64}$/) preventing path traversal.
 * 4. User ownership isolation: Metadata retains owner userId and verifies access.
 * 5. AES-256-GCM authenticated encryption for all blobs.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit standard for GCM
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256-bit key
const SCRYPT_COST = 131072; // 2^17 N (increased per audit)
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const BLOB_ID_REGEX = /^[a-f0-9]{64}$/;
const KEY_CHECK_MAGIC = "ZENVAULT_VALID_KEY_V1";

interface VaultStatus {
  isUnlocked: boolean;
  vaultPath: string;
  blobCount: number;
  unlockedAt: string | null;
}

export class ZenVaultService {
  private static instance: ZenVaultService;
  private masterKey: Buffer | null = null;
  private vaultDirectory: string;
  private blobsDirectory: string;
  private isUnlocked: boolean = false;
  private unlockedAt: Date | null = null;

  private constructor() {
    const basePath = process.env.ZENLECS_DATA_PATH || process.cwd();
    this.vaultDirectory = path.join(basePath, ".zenvault");
    this.blobsDirectory = path.join(this.vaultDirectory, "blobs");

    this.ensureDirectories();
  }

  public static getInstance(): ZenVaultService {
    if (!ZenVaultService.instance) {
      ZenVaultService.instance = new ZenVaultService();
    }
    return ZenVaultService.instance;
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.vaultDirectory)) {
      fs.mkdirSync(this.vaultDirectory, { recursive: true });
    }
    if (!fs.existsSync(this.blobsDirectory)) {
      fs.mkdirSync(this.blobsDirectory, { recursive: true });
    }
  }

  /**
   * Unlock the steel vault using the lawyer's master passphrase.
   * Uses a key-check verification token to ensure the passphrase is 100% correct
   * before allowing any operations.
   */
  public async unlock(passphrase: string): Promise<boolean> {
    if (!passphrase || passphrase.length < 8) {
      throw new Error("Master passphrase must be at least 8 characters.");
    }

    const saltPath = path.join(this.vaultDirectory, "vault.salt");
    const keyCheckPath = path.join(this.vaultDirectory, "vault.check");
    let salt: Buffer;

    if (fs.existsSync(saltPath)) {
      salt = fs.readFileSync(saltPath);
    } else {
      salt = crypto.randomBytes(SALT_LENGTH);
      fs.writeFileSync(saltPath, salt);
    }

    // Derive Master Key using scrypt
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        passphrase,
        salt,
        KEY_LENGTH,
        {
          N: SCRYPT_COST,
          r: SCRYPT_BLOCK_SIZE,
          p: SCRYPT_PARALLELISM,
          maxmem: 256 * 1024 * 1024,
        },
        (err, progressKey) => {
          if (err) reject(err);
          else resolve(progressKey);
        }
      );
    });

    // Key-check verification: Ensure the derived key matches the existing vault
    if (fs.existsSync(keyCheckPath)) {
      try {
        const checkData = fs.readFileSync(keyCheckPath);
        const iv = checkData.subarray(0, IV_LENGTH);
        const tag = checkData.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const ciphertext = checkData.subarray(IV_LENGTH + TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

        if (decrypted !== KEY_CHECK_MAGIC) {
          throw new Error("Invalid master passphrase.");
        }
      } catch {
        crypto.randomFillSync(derivedKey);
        throw new Error("Invalid master passphrase. Access denied.");
      }
    } else {
      // Legacy vault migration: If vault.salt exists and blobs exist but vault.check is missing,
      // verify the passphrase by attempting to decrypt an existing blob first.
      const existingBlobs = fs.existsSync(this.blobsDirectory)
        ? fs.readdirSync(this.blobsDirectory).filter(f => f.endsWith(".zen"))
        : [];

      if (existingBlobs.length > 0) {
        let migrationVerified = false;
        const testBlobPath = path.join(this.blobsDirectory, existingBlobs[0]);
        try {
          const testBuffer = fs.readFileSync(testBlobPath);
          if (testBuffer.length >= IV_LENGTH + TAG_LENGTH) {
            const tIv = testBuffer.subarray(0, IV_LENGTH);
            const tTag = testBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
            const tCipher = testBuffer.subarray(IV_LENGTH + TAG_LENGTH);
            const tDecipher = crypto.createDecipheriv(ALGORITHM, derivedKey, tIv);
            tDecipher.setAuthTag(tTag);
            Buffer.concat([tDecipher.update(tCipher), tDecipher.final()]);
            migrationVerified = true;
          }
        } catch {
          crypto.randomFillSync(derivedKey);
          throw new Error("Invalid master passphrase. Legacy vault verification failed.");
        }

        if (!migrationVerified) {
          crypto.randomFillSync(derivedKey);
          throw new Error("Invalid master passphrase. Legacy vault verification failed.");
        }
      }

      // First setup or successful legacy migration: write persistent key-check token
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
      const encrypted = Buffer.concat([cipher.update(KEY_CHECK_MAGIC, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      fs.writeFileSync(keyCheckPath, Buffer.concat([iv, tag, encrypted]));
    }

    this.masterKey = derivedKey;
    this.isUnlocked = true;
    this.unlockedAt = new Date();

    // Note: Legacy unassigned blobs are safely isolated and require explicit admin migration.

    console.log("[ZenVault] Vault unlocked successfully. Zero-knowledge layer active.");
    return true;
  }

  /**
   * Immediately wipes the master key from memory and locks the vault
   */
  
  /**
   * Explicit administrator migration tool for legacy blobs.
   * Prevents race-conditions where non-admin users could claim unassigned legacy blobs.
   */
  public migrateLegacyBlobs(targetUserId: number): { migratedCount: number; blobIds: string[] } {
    if (!this.isUnlocked || !this.masterKey) {
      throw new Error("ZenVault must be unlocked by administrator to perform migration.");
    }
    const migratedIds: string[] = [];
    if (fs.existsSync(this.blobsDirectory)) {
      const existingBlobs = fs.readdirSync(this.blobsDirectory).filter(f => f.endsWith(".zen"));
      for (const blobFile of existingBlobs) {
        const bId = blobFile.replace(/\.zen$/, "");
        const mPath = path.join(this.blobsDirectory, `${bId}.meta`);
        if (!fs.existsSync(mPath)) {
          const defaultMeta = {
            originalName: `legacy-file-${bId.slice(0, 8)}`,
            mimetype: "application/octet-stream",
            size: 0,
            uploadedAt: new Date().toISOString(),
            userId: targetUserId,
            isLegacyMigrated: true
          };
          const mIv = crypto.randomBytes(IV_LENGTH);
          const mCipher = crypto.createCipheriv(ALGORITHM, this.masterKey, mIv);
          const mEncrypted = Buffer.concat([mCipher.update(JSON.stringify(defaultMeta), "utf8"), mCipher.final()]);
          const mTag = mCipher.getAuthTag();
          fs.writeFileSync(mPath, Buffer.concat([mIv, mTag, mEncrypted]));
          migratedIds.push(bId);
        }
      }
    }
    return { migratedCount: migratedIds.length, blobIds: migratedIds };
  }

  public lock(): void {
    if (this.masterKey) {
      crypto.randomFillSync(this.masterKey);
      this.masterKey = null;
    }
    this.isUnlocked = false;
    this.unlockedAt = null;
    console.log("[ZenVault] Vault locked. In-memory keys purged.");
  }

  public getStatus(): VaultStatus {
    const blobs = fs.existsSync(this.blobsDirectory) ? fs.readdirSync(this.blobsDirectory).filter(f => f.endsWith(".zen")) : [];
    return {
      isUnlocked: this.isUnlocked,
      vaultPath: this.vaultDirectory,
      blobCount: blobs.length,
      unlockedAt: this.unlockedAt ? this.unlockedAt.toISOString() : null,
    };
  }

  /**
   * Encrypts and writes a document/file buffer into the secure steel vault
   */
  public encryptAndStore(data: Buffer, metadata?: Record<string, any>): string {
    if (!this.isUnlocked || !this.masterKey) {
      throw new Error("ZenVault is locked. Cannot store document without unlocking.");
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const blobId = crypto.createHash("sha256").update(encryptedData).digest("hex");
    const blobFilePath = path.join(this.blobsDirectory, `${blobId}.zen`);

    // Payload structure: [12-byte IV] + [16-byte AuthTag] + [Encrypted Data]
    const payload = Buffer.concat([iv, authTag, encryptedData]);
    fs.writeFileSync(blobFilePath, payload);

    if (metadata) {
      const metaPath = path.join(this.blobsDirectory, `${blobId}.meta`);
      const metaIv = crypto.randomBytes(IV_LENGTH);
      const metaCipher = crypto.createCipheriv(ALGORITHM, this.masterKey, metaIv);
      const metaEncrypted = Buffer.concat([
        metaCipher.update(JSON.stringify(metadata), "utf8"),
        metaCipher.final(),
      ]);
      const metaTag = metaCipher.getAuthTag();
      fs.writeFileSync(metaPath, Buffer.concat([metaIv, metaTag, metaEncrypted]));
    }

    return blobId;
  }

  /**
   * Retrieves and decrypts a document from the steel vault.
   * If requestingUserId is provided, verifies user ownership through metadata.
   */
  public retrieveAndDecrypt(blobId: string, requestingUserId?: number): Buffer {
    if (!BLOB_ID_REGEX.test(blobId)) {
      throw new Error("Invalid blobId format.");
    }

    if (!this.isUnlocked || !this.masterKey) {
      throw new Error("ZenVault is locked. Cannot decrypt document.");
    }

    const blobFilePath = path.join(this.blobsDirectory, `${blobId}.zen`);
    if (!fs.existsSync(blobFilePath)) {
      throw new Error(`Blob ${blobId} not found in ZenVault.`);
    }

    // Check ownership (Strict Fail-closed: missing metadata or missing/mismatched userId always denies access)
    if (requestingUserId !== undefined) {
      const metaPath = path.join(this.blobsDirectory, `${blobId}.meta`);
      if (!fs.existsSync(metaPath)) {
        throw new Error("Access denied: Metadata missing. Unable to verify blob ownership.");
      }

      try {
        const metaBuffer = fs.readFileSync(metaPath);
        const metaIv = metaBuffer.subarray(0, IV_LENGTH);
        const metaTag = metaBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const metaCiphertext = metaBuffer.subarray(IV_LENGTH + TAG_LENGTH);

        const metaDecipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, metaIv);
        metaDecipher.setAuthTag(metaTag);
        const decryptedMeta = JSON.parse(
          Buffer.concat([metaDecipher.update(metaCiphertext), metaDecipher.final()]).toString("utf8")
        );

        if (decryptedMeta.userId === undefined || decryptedMeta.userId !== requestingUserId) {
          throw new Error("Access denied: You do not own this vault blob.");
        }
      } catch (err: any) {
        if (err.message.includes("Access denied")) throw err;
        throw new Error("Access denied: Unable to verify blob ownership.");
      }
    }

    const fileBuffer = fs.readFileSync(blobFilePath);
    if (fileBuffer.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error("Corrupted vault blob.");
    }

    const iv = fileBuffer.subarray(0, IV_LENGTH);
    const authTag = fileBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = fileBuffer.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  }

  /**
   * Removes a blob from the steel vault.
   */
  public removeBlob(blobId: string, requestingUserId?: number): boolean {
    if (!BLOB_ID_REGEX.test(blobId)) {
      throw new Error("Invalid blobId format.");
    }

    if (requestingUserId !== undefined) {
      // Validate ownership before removal
      this.retrieveAndDecrypt(blobId, requestingUserId);
    }

    const blobFilePath = path.join(this.blobsDirectory, `${blobId}.zen`);
    const metaPath = path.join(this.blobsDirectory, `${blobId}.meta`);

    if (fs.existsSync(blobFilePath)) {
      fs.unlinkSync(blobFilePath);
    }

    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    return true;
  }
}

export const zenVault = ZenVaultService.getInstance();
