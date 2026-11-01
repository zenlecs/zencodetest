import { createHash } from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "dist", "app");
const outDir = path.join(root, "dist", "test");
const zipPath = path.join(outDir, "app.zip");

execFileSync(
  process.execPath,
  [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "app/vite.config.ts", "--base=./"],
  { cwd: root, stdio: "inherit" },
);

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

execFileSync("tar", ["-a", "-cf", zipPath, "-C", appDir, "."], { stdio: "inherit" });

const sha256 = createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
let gitSha = process.env.GITHUB_SHA?.trim();
if (!gitSha) {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

const manifest = {
  channel: "test",
  gitSha,
  version,
  file: "app.zip",
  sha256,
};

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`test payload ${gitSha.slice(0, 7)} ${sha256.slice(0, 12)} → ${zipPath}`);
