import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { apiKeyPoolManager } from './key-pool'

describe('ApiKeyPoolManager', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    apiKeyPoolManager.resetForTesting()
  })

  it('parses single key, comma-separated keys and plural env variables', () => {
    process.env.TEST_API_KEY = 'sk-key1, sk-key2 ; sk-key3'
    process.env.TEST_API_KEYS = 'sk-key4\nsk-key5'

    const keys = apiKeyPoolManager.parseKeysFromEnv('TEST_API_KEY')
    expect(keys).toEqual(['sk-key1', 'sk-key2', 'sk-key3', 'sk-key4', 'sk-key5'])
  })

  it('rotates keys using round-robin', () => {
    process.env.TEST_ROTATION_KEY = 'sk-alpha123, sk-beta456, sk-gamma789'
    const manager = apiKeyPoolManager

    const key1 = manager.getNextKey('openai', 'TEST_ROTATION_KEY')
    const key2 = manager.getNextKey('openai', 'TEST_ROTATION_KEY')
    const key3 = manager.getNextKey('openai', 'TEST_ROTATION_KEY')
    const key4 = manager.getNextKey('openai', 'TEST_ROTATION_KEY')

    expect(key1).toBe('sk-alpha123')
    expect(key2).toBe('sk-beta456')
    expect(key3).toBe('sk-gamma789')
    expect(key4).toBe('sk-alpha123') // Wraps around
  })

  it('places failed keys in cooldown and skips them during rotation', () => {
    process.env.TEST_FAILOVER_KEY = 'sk-good123, sk-bad456'
    const manager = apiKeyPoolManager

    // Initial sync
    const firstKey = manager.getNextKey('openai', 'TEST_FAILOVER_KEY')
    expect(firstKey).toBe('sk-good123')

    // Mark bad key in cooldown for 60 seconds
    manager.markKeyError('openai', 'sk-bad456', 60_000)

    // Next key should skip sk-bad456 and use sk-good123
    const nextKey1 = manager.getNextKey('openai', 'TEST_FAILOVER_KEY')
    const nextKey2 = manager.getNextKey('openai', 'TEST_FAILOVER_KEY')
    expect(nextKey1).toBe('sk-good123')
    expect(nextKey2).toBe('sk-good123')

    // Verify pool status
    const status = manager.getPoolStatus('openai', 'TEST_FAILOVER_KEY')
    expect(status.totalKeys).toBe(2)
    expect(status.activeKeys).toBe(1)
    expect(status.coolingDownKeys).toBe(1)
  })

  it('recovers key after markKeySuccess', () => {
    process.env.TEST_RECOVERY_KEY = 'sk-recoverable123'
    const manager = apiKeyPoolManager

    manager.markKeyError('openai', 'sk-recoverable123', 60_000)
    let status = manager.getPoolStatus('openai', 'TEST_RECOVERY_KEY')
    expect(status.coolingDownKeys).toBe(1)

    manager.markKeySuccess('openai', 'sk-recoverable123')
    status = manager.getPoolStatus('openai', 'TEST_RECOVERY_KEY')
    expect(status.coolingDownKeys).toBe(0)
    expect(status.activeKeys).toBe(1)
  })
})
