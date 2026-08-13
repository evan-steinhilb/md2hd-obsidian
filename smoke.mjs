// The smallest thing that fails if the build breaks: both artifacts exist,
// the sheet was rehomed for a shadow root, and obsidian stayed external.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./.gen/css.js', import.meta.url), 'utf8')
const js = readFileSync(new URL('./main.js', import.meta.url), 'utf8')

assert(!css.includes(':root'), ':root survived the rehoming — the tokens would leak past the shadow root')
assert(css.includes(':host'), 'no :host in the sheet')
assert(js.includes('require("obsidian")'), 'obsidian was bundled instead of left external')
assert(js.includes('md2hd-map'), 'the view type is missing from the bundle')

console.log('smoke ok')
