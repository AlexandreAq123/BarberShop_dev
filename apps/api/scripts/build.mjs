// Empacota a API em dist/ com esbuild.
// Dependências de node_modules ficam externas; o pacote do workspace
// (@barber/contracts) e o Prisma Client gerado entram no bundle.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@barber/"));

await build({
  entryPoints: ["src/server.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: [...external, ...external.map((name) => `${name}/*`)],
  // Pacotes CommonJS importados de ESM precisam de `require` disponível.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
