#!/usr/bin/env node
/**
 * Maintainer-only: refresh src/ from the md2hd monorepo.
 *
 * This repo is standalone — src/ is committed and `npm install && npm run
 * build` needs nothing outside it. This script only runs where the repo sits
 * nested inside the monorepo (next to dev/), the way package/ syncs its dist.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', 'dev', 'src')
const out = join(here, '..', 'src')

if (!existsSync(src)) {
  console.error('sync: no ../dev/src — this only runs inside the md2hd monorepo')
  process.exit(1)
}

const FILES = [
  'ui/EmbedMap.tsx',
  'ui/Canvas.tsx',
  'ui/Detail.tsx',
  'ui/graph-parts.tsx',
  'ui/icons.tsx',
  'lib/parse.ts',
  'lib/layout.ts',
  'lib/palette.ts',
  'theme.css',
  'styles/base.css',
]

for (const f of FILES) {
  mkdirSync(dirname(join(out, f)), { recursive: true })
  cpSync(join(src, f), join(out, f))
  console.log(`  src/${f}`)
}
