const ACTIONS = [
  ['lubricate', /bôi\s+trơn/iu],
  ['replace', /thay\s+(?:mới|thế)|thay\s+dầu/iu],
  ['inspect', /kiểm\s+tra/iu],
  ['rotate', /đảo\s+lốp/iu],
  ['scheduled_service', /bảo\s+dưỡng/iu],
]

const CONNECTORS = /\s+(hoặc|hay|và|đồng thời|sau đó)\s+/giu
const THRESHOLD_SIGNAL = /\d+(?:[.,\s]\d+)?\s*(?:km|kilômét|kilomet(?:er)?s?|năm|years?|tháng|months?|ngày|days?|phút|minutes?)\b|hàng\s+(?:năm|tháng|ngày)|mỗi\s+(?:lần|\d)|sau\s+mỗi\s+\d/iu

export function detectActionHint(text) {
  for (const [action, pattern] of ACTIONS) if (pattern.test(String(text || ''))) return action
  return null
}

/**
 * Associates one interval match with its nearest action clause. A connector
 * without a new action inherits the previous action; a new action is kept
 * local and marked as a conflict when it differs from the previous one.
 */
export function decomposeSemanticClause(statement, rawValue) {
  const text = String(statement || '')
  const valueIndex = text.indexOf(rawValue)
  if (valueIndex < 0) {
    return {
      clause: text,
      connector: null,
      explicitAction: detectActionHint(text),
      inheritedAction: null,
      actionHint: detectActionHint(text),
      actionConflict: false,
      qualifierHint: null,
      intervalRelation: null,
      flags: [],
    }
  }

  const separators = [...text.matchAll(CONNECTORS)]
  const before = separators.filter(match => match.index < valueIndex).at(-1) || null
  const after = separators.find(match => match.index > valueIndex) || null
  const afterAfter = after ? separators.find(match => match.index > after.index) || null : null
  const beforeBefore = before
    ? separators.filter(match => match.index < before.index).at(-1) || null
    : null
  const start = before ? before.index + before[0].length : 0
  const end = after?.index ?? text.length
  const clause = text.slice(start, end).trim()
  const previousClause = before ? text.slice(0, before.index).trim() : ''
  const previousLocalClause = before
    ? text.slice(beforeBefore ? beforeBefore.index + beforeBefore[0].length : 0, before.index).trim()
    : ''
  const nextClause = after
    ? text.slice(after.index + after[0].length, afterAfter?.index ?? text.length).trim()
    : ''
  const connector = before?.[1]?.toLocaleLowerCase('vi') || null
  const nextConnector = after?.[1]?.toLocaleLowerCase('vi') || null
  const explicitAction = detectActionHint(clause)
  const inheritedAction = detectActionHint(previousLocalClause) || detectActionHint(previousClause)
  const nextAction = detectActionHint(nextClause)
  const actionHint = explicitAction || inheritedAction || detectActionHint(text)
  const previousActionConflict = Boolean(explicitAction && inheritedAction && explicitAction !== inheritedAction)
  const nextActionConflict = Boolean(nextAction && actionHint && nextAction !== actionHint)
    && ['hoặc', 'hay', 'và', 'đồng thời', 'sau đó'].includes(nextConnector)
  const actionConflict = previousActionConflict || nextActionConflict
  const previousThresholdAlternative = ['hoặc', 'hay'].includes(connector)
    && THRESHOLD_SIGNAL.test(previousLocalClause)
    && !previousActionConflict
  const nextThresholdAlternative = ['hoặc', 'hay'].includes(nextConnector)
    && THRESHOLD_SIGNAL.test(nextClause)
    && !nextActionConflict
  const sameActionThreshold = previousThresholdAlternative || nextThresholdAlternative
  const detectedActions = ACTIONS
    .filter(([, pattern]) => pattern.test(text))
    .map(([action]) => action)
  const groupSemanticFlags = detectedActions.length > 1 ? ['MULTI_ACTION_CLAUSE'] : []
  const actionBindingAmbiguous = Boolean(detectedActions.length > 1 && !explicitAction && !inheritedAction && actionHint)
  const flags = actionBindingAmbiguous ? ['ACTION_BINDING_AMBIGUOUS'] : []

  return {
    clause,
    connector,
    explicitAction,
    inheritedAction,
    actionHint,
    actionConflict,
    // "hoặc/hay" only establishes alternative triggers. It must not be
    // promoted to "whichever comes first" unless the source says so.
    qualifierHint: null,
    intervalRelation: sameActionThreshold ? 'or' : null,
    groupSemanticFlags,
    flags,
  }
}
