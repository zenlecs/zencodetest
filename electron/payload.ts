import { execFile } from "child_process";
import { createHash } from "crypto";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { finished } from "stream/promises";
import { promisify } from "util";
import { app } from "electron";

const execFileAsync = promisify(execFile);

export const TEST_RELEASE_BASE = "https://github.com/zenlecs/zencodetest/releases/download/test";

export type PayloadProgress = {
  status: "checking" | "downloading" | "extracting" | "ready" | "error";
  localSha: string | null;
  remoteSha: string | null;
  version: string | null;
  percent: number;
  bytesPerSecond: number;
  message: string;
  upToDate: boolean;
};

type Manifest = {
  channel: string;
  gitSha: string;
  version: string;
  file: string;
  sha256: string;
};

type Installed = {
  gitSha: string;
  dir: string;
};

function payloadRoot() {
  return path.join(app.getPath("userData"), "payload");
}

function currentPath() {
  return path.join(payloadRoot(), "current.json");
}

export async function readInstalled(): Promise<Installed | null> {
  try {
    const raw = await fs.readFile(currentPath(), "utf8");
    const parsed = JSON.parse(raw) as Installed;
    if (!parsed?.gitSha || !parsed?.dir) return null;
    const index = path.join(parsed.dir, "index.html");
    await fs.access(index);
    return parsed;
  } catch {
    return null;
  }
}

export async function installedIndexPath(): Promise<string | null> {
  const installed = await readInstalled();
  if (!installed) return null;
  return path.join(installed.dir, "index.html");
}

async function fetchManifest(): Promise<Manifest> {
  const response = await fetch(`${TEST_RELEASE_BASE}/manifest.json`);
  if (!response.ok) {
    throw new Error(`Could not download the manifest (${response.status}). The release must be public.`);
  }
  const manifest = (await response.json()) as Manifest;
  if (manifest.file !== "app.zip" || !/^[a-f0-9]{64}$/i.test(manifest.sha256) || !manifest.gitSha) {
    throw new Error("The manifest is invalid.");
  }
  return manifest;
}

function progress(partial: Partial<PayloadProgress> & Pick<PayloadProgress, "status" | "message">): PayloadProgress {
  return {
    localSha: null,
    remoteSha: null,
    version: null,
    percent: 0,
    bytesPerSecond: 0,
    upToDate: false,
    ...partial,
  };
}

export async function payloadStatus(): Promise<PayloadProgress> {
  const installed = await readInstalled();
  try {
    const manifest = await fetchManifest();
    const upToDate = installed?.gitSha === manifest.gitSha;
    return progress({
      status: "ready",
      message: upToDate ? "The software is up to date." : "A new version is available.",
      localSha: installed?.gitSha ?? null,
      remoteSha: manifest.gitSha,
      version: manifest.version,
      percent: upToDate ? 100 : 0,
      upToDate,
    });
  } catch (error) {
    return progress({
      status: "error",
      message: error instanceof Error ? error.message : "Could not read the version.",
      localSha: installed?.gitSha ?? null,
    });
  }
}

async function downloadZip(dest: string, expectedSha: string, onProgress: (loaded: number, total: number, speed: number) => void) {
  const response = await fetch(`${TEST_RELEASE_BASE}/app.zip`);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download app.zip (${response.status}).`);
  }
  const total = Number(response.headers.get("content-length") || 0);
  const hash = createHash("sha256");
  const file = createWriteStream(dest);
  const reader = response.body.getReader();
  let loaded = 0;
  let lastAt = Date.now();
  let lastLoaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    hash.update(chunk);
    if (!file.write(chunk)) {
      await new Promise<void>((resolve) => file.once("drain", () => resolve()));
    }
    loaded += chunk.length;
    const now = Date.now();
    const elapsed = (now - lastAt) / 1000;
    const speed = elapsed > 0.2 ? (loaded - lastLoaded) / elapsed : 0;
    if (elapsed > 0.2) {
      lastAt = now;
      lastLoaded = loaded;
    }
    onProgress(loaded, total, speed);
  }
  file.end();
  await finished(file);
  const digest = hash.digest("hex");
  if (digest.toLowerCase() !== expectedSha.toLowerCase()) {
    await fs.rm(dest, { force: true });
    throw new Error("The downloaded file does not match the manifest checksum.");
  }
}

function tarBinary() {
  return process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
}

function zipEntryTarget(root: string, name: string) {
  const stripped = name.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!stripped || stripped === ".") return null;
  if (stripped.startsWith("/") || /^[A-Za-z]:/.test(stripped)) {
    throw new Error("The archive path is invalid.");
  }
  const parts = stripped.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("The archive path is invalid.");
  }
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("The archive path is invalid.");
  }
  return target;
}

async function extractAppZip(zipPath: string, stagingRoot: string) {
  const tar = tarBinary();
  const listed = await execFileAsync(tar, ["-tf", zipPath], { windowsHide: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  for (const line of listed.stdout.split(/\r?\n/)) {
    if (line) zipEntryTarget(stagingRoot, line);
  }
  await execFileAsync(tar, ["-xf", zipPath, "-C", stagingRoot], { windowsHide: true });
}

let installing = false;

export async function payloadInstall(send: (update: PayloadProgress) => void): Promise<PayloadProgress> {
  if (installing) {
    const busy = progress({ status: "downloading", message: "Installation is already running." });
    send(busy);
    return busy;
  }
  installing = true;
  const root = payloadRoot();
  await fs.mkdir(root, { recursive: true });
  const zipPath = path.join(root, "app.zip");
  let staging = "";
  try {
    send(progress({ status: "checking", message: "Checking the version..." }));
    const manifest = await fetchManifest();
    const installed = await readInstalled();
    if (installed?.gitSha === manifest.gitSha) {
      const ready = progress({
        status: "ready",
        message: "The software is up to date.",
        localSha: installed.gitSha,
        remoteSha: manifest.gitSha,
        version: manifest.version,
        percent: 100,
        upToDate: true,
      });
      send(ready);
      return ready;
    }

    send(progress({
      status: "downloading",
      message: "Downloading files...",
      localSha: installed?.gitSha ?? null,
      remoteSha: manifest.gitSha,
      version: manifest.version,
    }));
    await downloadZip(zipPath, manifest.sha256, (loaded, total, speed) => {
      send(progress({
        status: "downloading",
        message: "Downloading files...",
        localSha: installed?.gitSha ?? null,
        remoteSha: manifest.gitSha,
        version: manifest.version,
        percent: total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
        bytesPerSecond: speed,
      }));
    });

    send(progress({
      status: "extracting",
      message: "Extracting the installation...",
      localSha: installed?.gitSha ?? null,
      remoteSha: manifest.gitSha,
      version: manifest.version,
      percent: 99,
    }));

    staging = path.join(root, `.staging-${manifest.gitSha}`);
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const stagingRoot = path.resolve(staging);
    await extractAppZip(zipPath, stagingRoot);
    await fs.access(path.join(staging, "index.html"));

    const finalDir = path.join(root, manifest.gitSha);
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(staging, finalDir);
    staging = "";
    const record: Installed = { gitSha: manifest.gitSha, dir: finalDir };
    const nextCurrent = currentPath();
    await fs.writeFile(`${nextCurrent}.tmp`, JSON.stringify(record), "utf8");
    await fs.rename(`${nextCurrent}.tmp`, nextCurrent);
    await fs.rm(zipPath, { force: true });
    if (installed && installed.dir !== finalDir) {
      await fs.rm(installed.dir, { recursive: true, force: true });
    }

    const ready = progress({
      status: "ready",
      message: "Installation complete.",
      localSha: manifest.gitSha,
      remoteSha: manifest.gitSha,
      version: manifest.version,
      percent: 100,
      upToDate: true,
    });
    send(ready);
    return ready;
  } catch (error) {
    if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fs.rm(zipPath, { force: true }).catch(() => {});
    const failed = progress({
      status: "error",
      message: error instanceof Error ? error.message : "Installation failed.",
    });
    send(failed);
    return failed;
  } finally {
    installing = false;
  }
}
