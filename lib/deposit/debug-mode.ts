type DebugEnvironment = {
  NODE_ENV?: string
  ENABLE_DEPOSIT_DEBUG_ACTIONS?: string
}

export function areDepositDebugActionsEnabled(env: DebugEnvironment = process.env) {
  return env.NODE_ENV !== 'production' && env.ENABLE_DEPOSIT_DEBUG_ACTIONS === 'true'
}

export function assertDepositDebugActionsEnabled(env: DebugEnvironment = process.env) {
  if (!areDepositDebugActionsEnabled(env)) {
    throw new Error('DEPOSIT_DEBUG_ACTIONS_DISABLED')
  }
}
