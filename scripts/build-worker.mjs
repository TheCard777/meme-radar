// Bundle le worker collecteur (TypeScript) en un seul fichier JS Node-compatible.
// Aucune logique métier ici : uniquement le packaging pour un hébergeur type Railway.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src/collector/main.ts")],
  outfile: path.join(root, "dist/worker.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  banner: {
    // Certaines dépendances CJS bundlées attendent require/__dirname.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join("\n"),
  },
  alias: { "@": path.join(root, "src") },
});
