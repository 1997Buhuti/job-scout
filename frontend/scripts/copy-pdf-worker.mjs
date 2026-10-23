/**
 * Copies the pdf.js worker shipped with `pdf-parse` into `public/` so the
 * browser can load it from the same origin (`/pdf.worker.mjs`).
 *
 * `pdf-parse` does not export the worker file, so it is located relative to
 * the package's resolved main entry:
 *   <pkg>/dist/pdf-parse/cjs/index.cjs -> <pkg>/dist/pdf-parse/web/pdf.worker.mjs
 *
 * Runs via the `predev` / `prebuild` npm scripts. The copy is git-ignored.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mainEntry = require.resolve('pdf-parse');
const source = join(dirname(mainEntry), '..', 'web', 'pdf.worker.mjs');

if (!existsSync(source)) {
  console.error(`[copy-pdf-worker] pdf.js worker not found at ${source}`);
  process.exit(1);
}

const publicDir = join(frontendRoot, 'public');
mkdirSync(publicDir, { recursive: true });
copyFileSync(source, join(publicDir, 'pdf.worker.mjs'));
console.log('[copy-pdf-worker] public/pdf.worker.mjs updated');
