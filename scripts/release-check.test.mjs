import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

const scriptUrl = new URL('./release-check.mjs', import.meta.url)
const workflowUrl = new URL('../.github/workflows/release.yml', import.meta.url)
const hasScript = existsSync(scriptUrl)
const hasWorkflow = existsSync(workflowUrl)
const loadValidator = async () => (await import(scriptUrl.href)).validateRelease

const valid = {
  tag: '0.2.4',
  pkg: { version: '0.2.4' },
  manifest: { version: '0.2.4', minAppVersion: '1.5.0' },
  versions: { '0.2.4': '1.5.0' },
}

test('release validator exists', () => {
  assert.equal(hasScript, true)
})

test('accepts one exact stable version across all release metadata', { skip: !hasScript }, async () => {
  const validateRelease = await loadValidator()
  assert.doesNotThrow(() => validateRelease(valid.tag, valid.pkg, valid.manifest, valid.versions))
})

test('rejects v-prefixed or prerelease tags', { skip: !hasScript }, async () => {
  const validateRelease = await loadValidator()
  for (const tag of ['v0.2.4', '0.2.4-beta.1']) {
    assert.throws(() => validateRelease(tag, valid.pkg, valid.manifest, valid.versions))
  }
})

test('rejects mismatched package, manifest, or versions metadata', { skip: !hasScript }, async () => {
  const validateRelease = await loadValidator()
  assert.throws(() => validateRelease('0.2.5', valid.pkg, valid.manifest, valid.versions))
  assert.throws(() =>
    validateRelease(valid.tag, valid.pkg, valid.manifest, { '0.2.4': '1.4.0' }),
  )
})

test('release workflow exists', () => {
  assert.equal(hasWorkflow, true)
})

test('release workflow has the required permissions, attestation, and assets', { skip: !hasWorkflow }, () => {
  const source = readFileSync(workflowUrl, 'utf8')
  const workflow = parse(source)
  assert.equal(workflow.permissions.contents, 'write')
  assert.equal(workflow.permissions['id-token'], 'write')
  assert.equal(workflow.permissions.attestations, 'write')
  assert.match(source, /uses:\s*actions\/attest@v4/)
  assert.match(source, /subject-path:\s*main\.js/)
  assert.match(source, /gh release create[^\n]*main\.js manifest\.json/)
})
