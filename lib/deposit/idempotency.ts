export type DepositReplayDecision = 'CREATE' | 'REPLAY' | 'CONFLICT'

export function decideDepositReplay(
  existingRequestHash: string | null | undefined,
  requestHash: string,
): DepositReplayDecision {
  if (existingRequestHash === undefined) return 'CREATE'
  if (existingRequestHash === null || existingRequestHash === requestHash) return 'REPLAY'
  return 'CONFLICT'
}

