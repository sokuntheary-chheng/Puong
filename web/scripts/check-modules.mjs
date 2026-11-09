#!/usr/bin/env node
/**
 * Bundles the plain-TypeScript modules under test and runs their checks.
 *
 * The application's domain rules are TypeScript, and Node cannot import
 * TypeScript directly. Rather than add a test framework during M1 — Vitest
 * arrives at M2, where the rubric asks for tests — this uses esbuild through
 * npx to produce an ESM bundle of each module and then runs plain Node
 * assertions against it. It needs the network on the first run only.
 *
 * The bundle is written to web/.checks, which is gitignored: generated
 * output does not belong in the repository, and the point of these scripts
 * is that the source can be rebuilt and re-checked from nothing.
 *
 * Run with: npm run check:modules
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const outDir = join(webRoot, '.checks');

const modules = {
  'memoryValidation.mjs': 'src/utils/memoryValidation.ts',
  'svc.mjs': 'src/services/api.ts',
  'gen.mjs': 'src/services/generations.ts',
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [outName, src] of Object.entries(modules)) {
  execFileSync(
    'npx',
    [
      '--yes',
      'esbuild',
      src,
      '--bundle',
      '--format=esm',
      `--outfile=${join(outDir, outName)}`,
      '--log-level=error',
    ],
    { cwd: webRoot, stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

const checks = ['memoryValidation.test.mjs', 'serviceLayer.test.mjs'];
for (const check of checks) {
  console.log(`\n${check}`);
  await import(pathToFileURL(join(here, 'checks', check)).href);
}
