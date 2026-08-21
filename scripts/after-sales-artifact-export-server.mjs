import { spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const enabled = ['1', 'true', 'yes'].includes(
  String(process.env.AFTER_SALES_ARTIFACT_EXPORT_ENABLED || '').toLowerCase(),
)
const token = String(process.env.AFTER_SALES_ARTIFACT_EXPORT_TOKEN || '').trim()
const artifactRoot = path.resolve(
  process.env.RAILWAY_VOLUME_MOUNT_PATH
    || path.join(process.cwd(), '.local', 'after-sales'),
)
const port = Number(process.env.PORT || 3000)

if (!enabled) throw new Error('After-sales artifact export is disabled')
if (token.length < 32) throw new Error('AFTER_SALES_ARTIFACT_EXPORT_TOKEN must contain at least 32 characters')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid')
if (!fs.existsSync(artifactRoot) || !fs.statSync(artifactRoot).isDirectory()) {
  throw new Error('After-sales artifact directory is unavailable')
}

function log(event, details = {}) {
  console.log(JSON.stringify({
    component: 'after-sales-artifact-export',
    event,
    at: new Date().toISOString(),
    ...details,
  }))
}

function hasValidToken(request) {
  const authorization = String(request.headers.authorization || '')
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const expectedBuffer = Buffer.from(token)
  const suppliedBuffer = Buffer.from(supplied)
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

function applySecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Content-Security-Policy', "default-src 'none'")
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
}

let transferStarted = false
let shuttingDown = false

const server = http.createServer((request, response) => {
  applySecurityHeaders(response)

  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' })
    response.end('Method Not Allowed')
    return
  }

  const requestUrl = new URL(request.url || '/', 'http://artifact-export.local')
  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ status: 'ready' }))
    return
  }

  if (requestUrl.pathname !== '/artifact') {
    response.writeHead(404)
    response.end('Not Found')
    return
  }

  if (!hasValidToken(request)) {
    response.writeHead(401, { 'WWW-Authenticate': 'Bearer' })
    response.end('Unauthorized')
    return
  }

  if (transferStarted) {
    response.writeHead(409)
    response.end('Artifact transfer already started')
    return
  }
  transferStarted = true

  response.writeHead(200, {
    'Content-Disposition': 'attachment; filename="after-sales-artifacts.tgz"',
    'Content-Type': 'application/gzip',
  })

  const archive = spawn('tar', ['-czf', '-', '-C', artifactRoot, '.'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let archiveError = ''

  archive.stderr.on('data', chunk => {
    if (archiveError.length < 4096) archiveError += chunk.toString('utf8')
  })
  archive.on('error', error => {
    log('archive_spawn_failed', { message: error.message })
    response.destroy(error)
  })
  archive.on('close', code => {
    if (code !== 0) {
      log('archive_failed', { code, message: archiveError.trim().slice(0, 512) })
      response.destroy(new Error('Artifact archive failed'))
    }
  })
  request.on('aborted', () => archive.kill('SIGTERM'))
  archive.stdout.pipe(response)

  response.once('finish', () => {
    if (shuttingDown) return
    shuttingDown = true
    log('artifact_transferred')
    setTimeout(() => server.close(() => process.exit(0)), 1000).unref()
  })
})

server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000
server.requestTimeout = 10 * 60_000
server.listen(port, '0.0.0.0', () => log('ready', { port }))

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  log('shutdown_requested', { signal })
  server.close(() => process.exit(0))
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
