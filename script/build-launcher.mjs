import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

run(node, [
  path.join(root, "node_modules", "esbuild", "bin", "esbuild"),
  "electron/main.ts",
  "--bundle",
  "--platform=node",
  "--external:electron",
  "--packages=external",
  "--format=esm",
  "--outdir=dist-electron",
]);

run(node, [
  path.join(root, "node_modules", "esbuild", "bin", "esbuild"),
  "electron/preload.ts",
  "--bundle",
  "--platform=node",
  "--external:electron",
  "--packages=external",
  "--format=cjs",
  "--outfile=dist-electron/preload.cjs",
]);

run(node, [
  path.join(root, "node_modules", "vite", "bin", "vite.js"),
  "build",
  "--config",
  "launcher/vite.config.ts",
  "--base=./",
]);

run(node, [
  path.join(root, "node_modules", "electron-builder", "cli.js"),
  "--win",
  "dir",
  "--config.directories.output=dist/portable",
]);

const unpacked = path.join(root, "dist", "portable", "win-unpacked");
const zipPath = path.join(root, "dist", "portable", "Zenlecs-Portable.zip");
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
run("tar", ["-a", "-cf", zipPath, "-C", unpacked, "."]);
console.log(`portable launcher → ${zipPath}`);
