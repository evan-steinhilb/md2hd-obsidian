// The smallest thing that fails if the build breaks: both artifacts exist,
// the sheet was rehomed for a shadow root, and obsidian stayed external.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const css = readFileSync(new URL('./.gen/css.js', import.meta.url), 'utf8')
const js = readFileSync(new URL('./main.js', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const parserSource = readFileSync(new URL('./src/lib/parse.ts', import.meta.url), 'utf8')

assert(!css.includes(':root'), ':root survived the rehoming — the tokens would leak past the shadow root')
assert(css.includes(':host'), 'no :host in the sheet')
assert(js.includes('require("obsidian")'), 'obsidian was bundled instead of left external')
assert(js.includes('md2hd-map'), 'the view type is missing from the bundle')
assert(js.includes('writing-md2hd-maps'), 'the agent skill is missing from the bundle')

const themeSource = readFileSync(new URL('./src/theme.css', import.meta.url), 'utf8')
for (const feature of ['scrollbar-width', 'text-decoration-color', '!important']) {
  assert(!themeSource.includes(feature), `src/theme.css still uses ${feature}`)
}

// platform: 'browser' (not 'node') — matches how build.mjs actually bundles the
// plugin. Under 'node', esbuild resolves yaml's Node/CJS export, which calls
// require('process') internally; that require has nothing to bind to once the
// bundle runs as an ESM module, and the parser never even finishes loading.
const parserBuild = await build({
  entryPoints: [fileURLToPath(new URL('./src/lib/parse.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
})
const parserUrl = `data:text/javascript;base64,${Buffer.from(parserBuild.outputFiles[0].contents).toString('base64')}`
const { splitDocs } = await import(parserUrl)
const [doc] = splitDocs(`---
defaults: &defaults
  type: event
  tags: [release]
<<: *defaults
id: launch
published: 2026-08-13
---
Notes.
`)
assert.equal(doc.fm.type, 'event')
assert.deepEqual(doc.fm.tags, ['release'])
assert.deepEqual(doc.fm.published, new Date('2026-08-13T00:00:00.000Z'))

assert.equal(pkg.dependencies.yaml, '^2.9.0')
assert.equal(pkg.dependencies['js-yaml'], undefined)
assert.match(parserSource, /from ['"]yaml['"]/)
assert.doesNotMatch(js, /js-yaml/)

console.log('smoke ok')
