import 'server-only'

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { redactSalesAgentInput } from './core/policy'

const MAX_STRING_LENGTH = 2_000
const MAX_ARRAY_LENGTH = 20
const MAX_DEPTH = 8
const SENSITIVE_KEY_SUFFIXES = ['token', 'secret', 'signature', 'authorization', 'apikey', 'cookie']

export type SalesAgentDebugContext = {
  requestId?: string
  conversationId?: string
  messageId?: string
}

export function salesAgentDebugLogsEnabled() {
  if (process.env.SALES_AGENT_DEBUG_LOGS_ENABLED === 'false') return false
  if (process.env.SALES_AGENT_DEBUG_LOGS_ENABLED === 'true') return true
  return process.env.NODE_ENV === 'development'
}

function safeValue(value: unknown, key = '', depth = 0): unknown {
  const normalizedKey = key.replace(/[_-]/g, '').toLowerCase()
  if (SENSITIVE_KEY_SUFFIXES.some((suffix) => normalizedKey.endsWith(suffix))) return '[redacted]'
  if (depth >= MAX_DEPTH) return '[max-depth]'
  if (typeof value === 'string') return redactSalesAgentInput(value).slice(0, MAX_STRING_LENGTH)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_LENGTH).map((item) => safeValue(item, key, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, safeValue(item, childKey, depth + 1)]))
  }
  return value === undefined ? undefined : String(value)
}

export function recordSalesAgentDebugEvent(
  event: string,
  context: SalesAgentDebugContext = {},
  data?: unknown,
) {
  if (!salesAgentDebugLogsEnabled()) return false
  const serialized = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...context,
    ...(data === undefined ? {} : { data: safeValue(data) }),
  })
  console.info('[sales-agent-debug]', serialized)
  const configuredPath = process.env.SALES_AGENT_DEBUG_LOG_FILE?.trim() || '.local/logs/sales-agent-debug.jsonl'
  if (configuredPath) {
    try {
      const logPath = resolve(process.cwd(), configuredPath)
      mkdirSync(dirname(logPath), { recursive: true })
      appendFileSync(logPath, `${serialized}\n`, 'utf8')
    } catch (error) {
      console.warn('[sales-agent-debug] Không thể ghi file debug.', { reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' })
    }
  }
  return true
}
