import { describe, expect, it } from 'vitest'

import { areDepositDebugActionsEnabled, assertDepositDebugActionsEnabled } from './debug-mode'

describe('deposit debug mode', () => {
  it('requires an explicit flag outside production', () => {
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'development' })).toBe(false)
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'development', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' })).toBe(true)
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'test', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' })).toBe(true)
  })

  it('can be enabled in production with the explicit flag', () => {
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'production', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' })).toBe(true)
    expect(() => assertDepositDebugActionsEnabled({ NODE_ENV: 'production', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' }))
      .not.toThrow()
  })
})
