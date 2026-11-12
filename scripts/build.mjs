// Puts the site together in site/: the static files from public/ and the compiled code from build/src/.
// Browsers load the compiled ES modules directly, so there's no bundler.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

rmSync("site", { recursive: true, force: true });
mkdirSync("site", { recursive: true });
cpSync("public", "site", { recursive: true });
cpSync(join("build", "src"), join("site", "js"), { recursive: true });

// The service worker caches every file of this version; its cache name changes when any file does.
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const list = files("site").filter((f) => !f.endsWith("sw.js")).map((f) => relative("site", f).split("\\").join("/")).sort();
const hash = createHash("sha256");
for (const f of list) hash.update(f).update(readFileSync(join("site", f)));
const sw = join("site", "sw.js");
try {
  const text = readFileSync(sw, "utf8")
    .replace("__VERSION__", hash.digest("hex").slice(0, 12))
    .replace("__FILES__", JSON.stringify(["./", ...list]));
  writeFileSync(sw, text);
} catch {
  // no service worker yet
}
console.log(`site/ ready: ${list.length} files`);
