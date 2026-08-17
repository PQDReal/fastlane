export function isSalesAgentEnabled() {
  return process.env.SALES_AGENT_ENABLED === 'true'
}

export function isSalesAgentHarnessEnabled() {
  return process.env.SALES_AGENT_HARNESS_ENABLED === 'true'
}

export function isSalesAgentInteractionsEnabled() {
  return process.env.SALES_AGENT_INTERACTIONS_ENABLED === 'true'
}
