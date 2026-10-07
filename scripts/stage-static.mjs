import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "agent/crew/dist");
const targets = ["dist", "render-site"];
for (const dir of targets) {
  const dest = resolve(root, dir);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  writeFileSync(resolve(dest, "DEPLOYED_AT.txt"), new Date().toISOString() + "\n");
}
console.log("staged static site → dist/ and render-site/");
