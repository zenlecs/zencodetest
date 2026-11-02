import { spawn } from "child_process";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import http from "http";
import https from "https";
import path from "path";
import extractZip from "extract-zip";

const PIPER_ZIP_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const MODEL_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx";
const MODEL_CONFIG_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json";
const MODEL_FILE = "tr_TR-fettah-medium.onnx";

export type VoiceAssetProgress = {
  percent: number;
  message: string;
};

function voiceRoot(): string {
  const base = process.env.ZENLECS_DATA_PATH || path.join(process.cwd(), "data");
  return path.join(base, "voice");
}

function assertWindowsVoiceHost() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Yerel Türkçe seslendirme şu anda Windows 64 bit üzerinde çalışır.");
  }
}

async function findPiperExe(root: string): Promise<string | null> {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.toLowerCase() === "piper.exe") return full;
    }
  }
  return null;
}

function downloadFile(
  url: string,
  dest: string,
  onBytes: (received: number, total: number | null) => void,
  redirects = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 10) {
      reject(new Error("İndirme adresi çok fazla yönlendirme yaptı."));
      return;
    }
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(
      url,
      { headers: { "User-Agent": "Zenlecs", Accept: "*/*" } },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          const next = new URL(location, url).href;
          downloadFile(next, dest, onBytes, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`İndirme başarısız (${status}).`));
          return;
        }
        const totalHeader = Number(response.headers["content-length"]);
        const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
        void fs.mkdir(path.dirname(dest), { recursive: true }).then(() => {
          const temp = `${dest}.part`;
          const file = createWriteStream(temp);
          let received = 0;
          let failed = false;
          const fail = (error: unknown) => {
            if (failed) return;
            failed = true;
            response.destroy();
            file.destroy();
            void fs.rm(temp, { force: true }).catch(() => undefined);
            const message = error instanceof Error ? error.message : "İndirme yarıda kesildi.";
            reject(new Error(message === "terminated" ? "İndirme bağlantısı koptu." : message));
          };
          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            onBytes(received, total);
            if (!file.write(chunk)) response.pause();
          });
          file.on("drain", () => response.resume());
          response.on("error", fail);
          file.on("error", fail);
          response.on("end", () => file.end());
          file.on("finish", () => {
            if (failed) return;
            void fs.rename(temp, dest).then(resolve, fail);
          });
        }, reject);
      }
    );
    request.on("error", (error) => {
      const message = error.message === "terminated" ? "bağlantı koptu" : error.message;
      reject(new Error(`İndirme bağlantısı koptu: ${message}`));
    });
  });
}

let sampleRateCache: number | null = null;

async function readSampleRate(configPath: string): Promise<number> {
  if (sampleRateCache) return sampleRateCache;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as { audio?: { sample_rate?: number } };
    const rate = parsed.audio?.sample_rate;
    sampleRateCache = typeof rate === "number" && rate > 0 ? rate : 22050;
  } catch {
    sampleRateCache = 22050;
  }
  return sampleRateCache;
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function assetsReady(): Promise<{ exe: string; model: string; config: string } | null> {
  const root = voiceRoot();
  const model = path.join(root, "models", MODEL_FILE);
  const config = `${model}.json`;
  const exe = await findPiperExe(path.join(root, "piper"));
  try {
    await fs.access(model);
    await fs.access(config);
  } catch {
    return null;
  }
  if (!exe) return null;
  return { exe, model, config };
}

let preparing: Promise<void> | null = null;

export async function ensureVoiceAssets(onProgress?: (progress: VoiceAssetProgress) => void): Promise<void> {
  if (await assetsReady()) {
    onProgress?.({ percent: 100, message: "Ses motoru hazır." });
    return;
  }
  if (!preparing) {
    preparing = prepareVoiceAssets(onProgress).finally(() => {
      preparing = null;
    });
  }
  await preparing;
}

async function prepareVoiceAssets(onProgress?: (progress: VoiceAssetProgress) => void): Promise<void> {
  assertWindowsVoiceHost();
  const root = voiceRoot();
  const piperDir = path.join(root, "piper");
  const zipPath = path.join(root, "piper_windows_amd64.zip");
  const modelPath = path.join(root, "models", MODEL_FILE);
  const configPath = `${modelPath}.json`;

  onProgress?.({ percent: 2, message: "Piper indiriliyor." });
  if (!(await findPiperExe(piperDir))) {
    await downloadFile(PIPER_ZIP_URL, zipPath, (received, total) => {
      const ratio = total ? received / total : 0.5;
      onProgress?.({ percent: Math.round(2 + ratio * 38), message: "Piper indiriliyor." });
    });
    onProgress?.({ percent: 42, message: "Piper açılıyor." });
    await fs.mkdir(piperDir, { recursive: true });
    await extractZip(zipPath, { dir: piperDir });
    await fs.rm(zipPath, { force: true }).catch(() => undefined);
  }

  onProgress?.({ percent: 46, message: "Türkçe ses indiriliyor." });
  try {
    await fs.access(modelPath);
  } catch {
    await downloadFile(MODEL_URL, modelPath, (received, total) => {
      const ratio = total ? received / total : 0.5;
      onProgress?.({ percent: Math.round(46 + ratio * 46), message: "Türkçe ses indiriliyor." });
    });
  }
  try {
    await fs.access(configPath);
  } catch {
    await downloadFile(MODEL_CONFIG_URL, configPath, () => undefined);
  }

  if (!(await assetsReady())) {
    throw new Error("Ses motoru kurulumu tamamlanamadı.");
  }
  onProgress?.({ percent: 100, message: "Ses motoru hazır." });
}

let speakChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = speakChain.then(task, task);
  speakChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function synthesizeSpeech(text: string): Promise<Buffer> {
  const spoken = text.replace(/\s+/g, " ").trim();
  if (!spoken) return Promise.reject(new Error("Okunacak metin gerekli."));
  if (spoken.length > 2000) return Promise.reject(new Error("Cümle çok uzun."));

  return enqueue(async () => {
    await ensureVoiceAssets();
    const ready = await assetsReady();
    if (!ready) throw new Error("Ses motoru hazır değil.");
    const sampleRate = await readSampleRate(ready.config);

    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(ready.exe, ["--model", ready.model, "--output_raw"], {
        cwd: path.dirname(ready.exe),
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Seslendirme zaman aşımına uğradı."));
      }, 20_000);

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 280);
          reject(new Error(detail || "Seslendirme başarısız."));
          return;
        }
        const pcm = Buffer.concat(stdout);
        if (pcm.length < 2) {
          reject(new Error("Seslendirme boş döndü."));
          return;
        }
        resolve(pcmToWav(pcm, sampleRate));
      });

      child.stdin.write(Buffer.from(`${spoken}\n`, "utf8"));
      child.stdin.end();
    });
  });
}
