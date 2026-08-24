export function isSalesAgentEnabled() {
  return process.env.SALES_AGENT_ENABLED === 'true'
}

export function isSalesAgentHarnessEnabled() {
  return process.env.SALES_AGENT_HARNESS_ENABLED === 'true'
}

export function isSalesAgentInteractionsEnabled() {
  return process.env.SALES_AGENT_INTERACTIONS_ENABLED === 'true'
}

/**
 * Returns whether the versioned Knowledge RAG capability may be exposed to the model.
 * The capability is deliberately disabled unless the release gate enables it.
 */
export function isSalesAgentKnowledgeRagEnabled() {
  return process.env.SALES_AGENT_KNOWLEDGE_RAG_ENABLED === 'true'
}

/**
 * Enables approved visual pointers on top of Knowledge RAG results.
 * Allows visual retrieval when enabled or in development.
 */
export function isSalesAgentVisualKnowledgeRetrievalEnabled() {
  if (process.env.SALES_AGENT_VISUAL_KNOWLEDGE_RETRIEVAL_ENABLED === 'false') return false
  if (process.env.SALES_AGENT_VISUAL_KNOWLEDGE_RETRIEVAL_ENABLED === 'true') return true
  return isSalesAgentKnowledgeRagEnabled()
}

/**
 * Allows visual knowledge retrieval to use AI_DRAFT annotations before manual review.
 * Draft content is opt-in outside production and always rejected in production.
 */
export function isSalesAgentVisualKnowledgeDraftsAllowed() {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.SALES_AGENT_VISUAL_KNOWLEDGE_ALLOW_DRAFTS === 'true'
}
