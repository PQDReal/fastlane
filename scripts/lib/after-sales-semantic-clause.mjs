const ACTIONS = [
  ['lubricate', /bôi\s+trơn/iu],
  ['replace', /thay\s+(?:mới|thế)|thay\s+dầu/iu],
  ['inspect', /kiểm\s+tra/iu],
  ['rotate', /đảo\s+lốp/iu],
  ['scheduled_service', /bảo\s+dưỡng/iu],
]

const CONNECTORS = /\s+(hoặc|hay|và|đồng thời|sau đó)\s+/giu
const THRESHOLD_SIGNAL = /\d+(?:[.,\s]\d+)?\s*(?:km|kilômét|kilomet(?:er)?s?|năm|years?|tháng|months?|ngày|days?|phút|minutes?)\b|hàng\s+(?:năm|tháng|ngày)|mỗi\s+(?:lần|\d)|sau\s+mỗi\s+\d/iu
const EVENT_TRIGGER_DEFINITIONS = [
  ['dashboard_oil_level_warning', /(?:dựa\s+vào\s+)?cảnh\s+báo\s+mức\s+dầu(?:\s+trên\s+màn\s+hình\s+hiển\s+thị)?/iu],
  ['before_driving', /trước\s+khi\s+chạy/iu],
  ['after_refueling', /sau\s+mỗi\s+lần\s+đổ\s+xăng/iu],
]
const EVENT_TRIGGER_SIGNAL = new RegExp(EVENT_TRIGGER_DEFINITIONS.map(([, pattern]) => pattern.source).join('|'), 'iu')
const WHICHEVER_COMES_FIRST = /t(?:ù|uỳ|ùy)\s*(?:thuộc|theo)?\s*(?:vào\s*)?(?:điều\s*kiện\s*)?(?:nào\s*)?đến\s*trước/iu
const UNLIMITED_DISTANCE = /không\s+giới\s+hạn\s+(?:số\s*)?(?:km|quãng\s+đường)/iu
const SUBJECTS = [
  ['steering_head_bearing', /cổ\s+phốt/iu],
  ['seat_lock_and_stands', /(?:khóa\s+yên|chân\s+chống)/iu],
  ['battery', /ắc\s*quy\s+lithium(?:[-\s]?ion)?|pin\s+(?:cao\s+áp|điện\s+áp\s+cao)/iu],
  ['battery_12v', /ắc\s*quy\s+12v|pin\s+12v/iu],
  ['battery_coolant', /nước\s+làm\s+mát\s+pin/iu],
  ['key_fob_battery', /pin\s+chìa\s+khóa/iu],
  ['brake_fluid', /dầu\s+phanh/iu],
  ['brake_system', /(?:tay|hệ\s+thống)\s+phanh/iu],
]

export function detectActionHint(text) {
  for (const [action, pattern] of ACTIONS) if (pattern.test(String(text || ''))) return action
  return null
}

export function detectSubjectHint(text) {
  for (const [subject, pattern] of SUBJECTS) if (pattern.test(String(text || ''))) return subject
  return null
}

function extractEventTriggers(...scopes) {
  const triggers = new Map()
  for (const scope of scopes) {
    const text = String(scope || '')
    for (const [code, pattern] of EVENT_TRIGGER_DEFINITIONS) {
      const match = text.match(pattern)
      if (!match || triggers.has(code)) continue
      triggers.set(code, {
        type: 'event',
        code,
        sourceText: match[0].replace(/\s+/gu, ' ').trim(),
      })
    }
  }
  return [...triggers.values()].sort((left, right) => left.code.localeCompare(right.code))
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
      qualifierHint: WHICHEVER_COMES_FIRST.test(text) ? 'whichever_comes_first' : null,
      distancePolicyHint: UNLIMITED_DISTANCE.test(text) ? 'unlimited' : null,
      subjectHint: detectSubjectHint(text),
      intervalRelation: null,
      nonNumericAlternativeTriggers: [],
      flags: [],
      groupSemanticFlags: [],
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
  const subjectHint = detectSubjectHint(clause) || detectSubjectHint(text)
  const previousActionConflict = Boolean(explicitAction && inheritedAction && explicitAction !== inheritedAction)
  const nextActionConflict = Boolean(nextAction && actionHint && nextAction !== actionHint)
    && ['hoặc', 'hay', 'và', 'đồng thời', 'sau đó'].includes(nextConnector)
  const actionConflict = previousActionConflict || nextActionConflict
  
  const previousThresholdAlternative = ['hoặc', 'hay'].includes(connector)
    && (THRESHOLD_SIGNAL.test(previousLocalClause) || EVENT_TRIGGER_SIGNAL.test(previousLocalClause))
    && !previousActionConflict
  const nextThresholdAlternative = ['hoặc', 'hay'].includes(nextConnector)
    && (THRESHOLD_SIGNAL.test(nextClause) || EVENT_TRIGGER_SIGNAL.test(nextClause))
    && !nextActionConflict
  const sameActionThreshold = previousThresholdAlternative || nextThresholdAlternative
  
  const detectedActions = ACTIONS
    .filter(([, pattern]) => pattern.test(text))
    .map(([action]) => action)
  const groupSemanticFlags = detectedActions.length > 1 ? ['MULTI_ACTION_CLAUSE'] : []
  const actionBindingAmbiguous = Boolean(detectedActions.length > 1 && !explicitAction && !inheritedAction && actionHint)
  const flags = []
  if (actionBindingAmbiguous) flags.push('ACTION_BINDING_AMBIGUOUS')

  const nonNumericAlternativeTriggers = extractEventTriggers(
    previousThresholdAlternative ? previousClause : '',
    nextThresholdAlternative ? nextClause : '',
  )
  if (nonNumericAlternativeTriggers.length) flags.push('NON_NUMERIC_ALTERNATIVE_TRIGGER')

  return {
    clause,
    connector,
    explicitAction,
    inheritedAction,
    actionHint,
    actionConflict,
    qualifierHint: WHICHEVER_COMES_FIRST.test(text) ? 'whichever_comes_first' : null,
    distancePolicyHint: UNLIMITED_DISTANCE.test(text) ? 'unlimited' : null,
    subjectHint,
    intervalRelation: sameActionThreshold ? 'or' : null,
    nonNumericAlternativeTriggers,
    groupSemanticFlags,
    flags: [...new Set(flags)],
  }
}
