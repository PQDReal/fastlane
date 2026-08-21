import { spawn } from 'node:child_process'

const intervalHours = Number(process.env.AFTER_SALES_REMOTE_WORKER_INTERVAL_HOURS || 12)
const intervalMs = Number.isFinite(intervalHours) && intervalHours >= 1 && intervalHours <= 168
  ? intervalHours * 60 * 60 * 1000
  : 12 * 60 * 60 * 1000
const singleRun = ['1', 'true', 'yes'].includes(String(process.env.AFTER_SALES_REMOTE_WORKER_SINGLE_RUN || '').toLowerCase())
const rawRecapture = !['0', 'false', 'no'].includes(String(process.env.AFTER_SALES_REMOTE_WORKER_RAW_RECAPTURE || 'true').toLowerCase())
const pipelineArgs = [
  'scripts/process-after-sales-pipeline.mjs',
  ...(rawRecapture ? ['--raw-recapture'] : []),
  '--reuse-verified-assets',
  '--stop-before-admin-review',
]

let stopping = false
let activeChild = null

function log(event, details = {}) {
  console.log(JSON.stringify({
    component: 'after-sales-remote-worker',
    event,
    at: new Date().toISOString(),
    ...details,
  }))
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function runPipeline() {
  return new Promise(resolve => {
    activeChild = spawn(process.execPath, pipelineArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })
    activeChild.on('error', error => {
      log('pipeline_spawn_error', { message: error.message })
      activeChild = null
      resolve(1)
    })
    activeChild.on('exit', code => {
      activeChild = null
      resolve(code || 0)
    })
  })
}

async function main() {
  log('started', {
    intervalHours,
    singleRun,
    rawRecapture,
    stages: pipelineArgs.slice(1),
    publication: 'blocked_until_admin_review',
  })
  do {
    const startedAt = Date.now()
    log('pipeline_started')
    const exitCode = await runPipeline()
    log('pipeline_finished', {
      exitCode,
      durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    })
    if (singleRun || stopping) break
    log('sleeping', { nextRunInHours: intervalHours })
    await sleep(intervalMs)
  } while (!stopping)
  log('stopped')
}

function requestStop(signal) {
  stopping = true
  log('shutdown_requested', { signal })
  if (activeChild) activeChild.kill('SIGTERM')
}

process.once('SIGTERM', () => requestStop('SIGTERM'))
process.once('SIGINT', () => requestStop('SIGINT'))

main().catch(error => {
  log('fatal_error', { message: error.message })
  process.exitCode = 1
})
