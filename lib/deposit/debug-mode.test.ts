import { describe, expect, it } from 'vitest'

import { areDepositDebugActionsEnabled, assertDepositDebugActionsEnabled } from './debug-mode'

describe('deposit debug mode', () => {
  it('requires an explicit flag outside production', () => {
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'development' })).toBe(false)
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'development', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' })).toBe(true)
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'test', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' })).toBe(true)
  })

  it('cannot be enabled in production', () => {
    expect(areDepositDebugActionsEnabled({ NODE_ENV: 'production', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' })).toBe(false)
    expect(() => assertDepositDebugActionsEnabled({ NODE_ENV: 'production', ENABLE_DEPOSIT_DEBUG_ACTIONS: 'true' }))
      .toThrow('DEPOSIT_DEBUG_ACTIONS_DISABLED')
  })
})
