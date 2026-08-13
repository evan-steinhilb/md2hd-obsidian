#!/usr/bin/env node
/**
 * md2hd — Obsidian plugin build. Two passes: the stylesheet, rehomed for a
 * shadow root, then the plugin itself. Everything resolves inside this repo.
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// 1. The stylesheet. The app's globals (:root tokens, the body ground, the
//    #root height chain) become :host so nothing leaks into Obsidian's UI —
//    the shadow boundary does the rest in both directions.
const css = await build({
  entryPoints: [join(here, 'entry.css')],
  bundle: true,
  minify: true,
  write: false,
})
const sheet = css.outputFiles[0].text
  .replaceAll(':root', ':host')
  .replace(/(^|[{}])html,body,#root\{/g, '$1:host{')
  .replace(/(^|[{}])body\{/g, '$1:host{')

mkdirSync(join(here, '.gen'), { recursive: true })
writeFileSync(join(here, '.gen', 'css.js'), `export default ${JSON.stringify(sheet)}\n`)

// 2. The plugin. `obsidian` stays external — the app provides it at runtime.
await build({
  entryPoints: [join(here, 'main.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  jsx: 'automatic',
  external: ['obsidian', 'electron'],
  // Pinned to this repo's copies: a stray node_modules anywhere above this
  // folder (a Deno cache in $HOME, say) could otherwise hand a second React
  // to some imports, and two Reacts means a null hooks dispatcher at runtime.
  alias: {
    react: join(here, 'node_modules', 'react'),
    'react-dom': join(here, 'node_modules', 'react-dom'),
  },
  outfile: join(here, 'main.js'),
  logLevel: 'info',
})
