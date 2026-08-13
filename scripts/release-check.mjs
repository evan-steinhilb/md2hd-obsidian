import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateRelease(tag, pkg, manifest, versions) {
  const errors = []
  if (!/^\d+\.\d+\.\d+$/.test(tag)) errors.push(`tag must be stable SemVer without a v prefix: ${tag}`)
  if (pkg.version !== tag) errors.push(`package.json version ${pkg.version} does not match ${tag}`)
  if (manifest.version !== tag) errors.push(`manifest.json version ${manifest.version} does not match ${tag}`)
  if (versions[tag] !== manifest.minAppVersion) {
    errors.push(`versions.json must map ${tag} to ${manifest.minAppVersion}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invoked) {
  const readJson = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'))
  const tag = process.argv[2]
  if (!tag) throw new Error('usage: node scripts/release-check.mjs <tag>')
  validateRelease(tag, readJson('package.json'), readJson('manifest.json'), readJson('versions.json'))
  console.log(`release metadata matches ${tag}`)
}
