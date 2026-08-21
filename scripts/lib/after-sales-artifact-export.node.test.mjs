import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SERVER = path.join(ROOT, 'scripts', 'after-sales-artifact-export-server.mjs')
const TOKEN = 'test-token-0123456789abcdef-0123456789abcdef'

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitUntilReady(url, child) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error(`Exporter exited before readiness with code ${child.exitCode}`)
    try {
      const response = await fetch(`${url}/health`)
      if (response.status === 200) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Exporter did not become ready')
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code))
  })
}

function listArchive(archivePath) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-tzf', archivePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', code => code
      ? reject(new Error(stderr.trim() || `tar exited ${code}`))
      : resolve(stdout.split(/\r?\n/u).filter(Boolean)))
  })
}

test('artifact exporter requires auth and sends a readable one-shot archive', async t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'after-sales-export-'))
  const archivePath = path.join(fixtureRoot, 'artifact.tgz')
  fs.writeFileSync(path.join(fixtureRoot, 'coverage-report.json'), '{"decision":"PASS"}\n')
  t.after(() => fs.rmSync(fixtureRoot, { force: true, recursive: true }))

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      AFTER_SALES_ARTIFACT_EXPORT_ENABLED: 'true',
      AFTER_SALES_ARTIFACT_EXPORT_TOKEN: TOKEN,
      PORT: String(port),
      RAILWAY_VOLUME_MOUNT_PATH: fixtureRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM')
  })

  await waitUntilReady(baseUrl, child)
  const unauthorized = await fetch(`${baseUrl}/artifact`)
  assert.equal(unauthorized.status, 401)

  const authorized = await fetch(`${baseUrl}/artifact`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  assert.equal(authorized.status, 200)
  assert.equal(authorized.headers.get('cache-control'), 'no-store, max-age=0')
  fs.writeFileSync(archivePath, Buffer.from(await authorized.arrayBuffer()))

  assert.equal(await waitForExit(child), 0)
  assert.match(output, /"event":"artifact_transferred"/u)
  assert.doesNotMatch(output, new RegExp(TOKEN, 'u'))
  assert.ok((await listArchive(archivePath)).some(entry => entry.endsWith('coverage-report.json')))
})
