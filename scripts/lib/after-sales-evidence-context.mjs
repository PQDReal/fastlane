const DEFAULT_MAX_CHARS = 520
const DEFAULT_OVERSHOOT_CHARS = 160
const LIST_START = /\n(?=\s*(?:[\u2022\u2666\u27a4\u25cf\u25aa\u25e6-]\s+|\d+(?:\.\d+)*[.)]\s+))/gu
const NUMBER_UNIT_LINE_JOIN = /(\d[\d., ]*)\s*\n\s*(km|kilomet(?:er)?s?|n[a\u0103\u00e2]m|th[a\u00e1]ng|ng[a\u00e0]y|ph[u\u00fa]t|%|VNĐ|VND|đồng)/giu

function clean(value) {
  return String(value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function renderContext(value) {
  return clean(value)
    .replace(NUMBER_UNIT_LINE_JOIN, '$1 $2')
    .replace(/\n/g, ' | ')
}

function isDecimalPoint(text, position) {
  return text[position] === '.' && /\d/.test(text[position - 1] || '') && /\d/.test(text[position + 1] || '')
}

function isSentenceBoundary(text, position) {
  const value = text[position]
  if (value === '.' && isDecimalPoint(text, position)) return false
  return value === '.' || value === '!' || value === '?' || value === ';'
}

function structuralStart(text, index, lineBreaksAreBoundaries) {
  const before = text.slice(0, index)
  let best = { position: 0, type: 'document_start' }
  for (const match of before.matchAll(/\n[ \t]*\n/g)) {
    const position = match.index + match[0].length
    if (position > best.position) best = { position, type: 'blank_line' }
  }
  for (const match of before.matchAll(LIST_START)) {
    const position = match.index + 1
    if (position > best.position) best = { position, type: 'list_or_section_start' }
  }
  if (lineBreaksAreBoundaries) {
    for (const match of before.matchAll(/\n(?![ \t]*\n)/g)) {
      const position = match.index + 1
      if (position > best.position) best = { position, type: 'line_break' }
    }
  }
  return best
}

function structuralEnd(text, index, lineBreaksAreBoundaries) {
  const after = text.slice(index)
  const candidates = []
  const blank = after.search(/\n[ \t]*\n/)
  if (blank >= 0) candidates.push({ position: index + blank, type: 'blank_line' })
  const list = after.search(LIST_START)
  if (list >= 0) candidates.push({ position: index + list + 1, type: 'list_or_section_start' })
  if (lineBreaksAreBoundaries) {
    const line = after.search(/\n(?![ \t]*\n)/u)
    if (line >= 0) candidates.push({ position: index + line, type: 'line_break' })
  }
  return candidates.sort((a, b) => a.position - b.position)[0] || { position: text.length, type: 'document_end' }
}

function sentenceBounds(text, blockStart, blockEnd, index, matchLength) {
  let start = blockStart
  for (let position = index - 1; position >= blockStart; position--) {
    if (isSentenceBoundary(text, position)) {
      start = position + 1
      break
    }
  }
  let end = blockEnd
  for (let position = index + matchLength; position < blockEnd; position++) {
    if (isSentenceBoundary(text, position)) {
      end = position + 1
      break
    }
  }
  return { start, end }
}

function wordSafeStart(text, start, lowerBound) {
  if (start <= lowerBound || /\s/.test(text[start] || '')) return start
  const nextSpace = text.indexOf(' ', start)
  const nextLine = text.indexOf('\n', start)
  const candidates = [nextSpace, nextLine].filter(value => value >= 0 && value < text.length)
  return candidates.length ? Math.min(...candidates) + 1 : start
}

function wordSafeEnd(text, end, upperBound) {
  if (end >= upperBound || /\s/.test(text[end - 1] || '')) return end
  const previousSpace = text.lastIndexOf(' ', end)
  const previousLine = text.lastIndexOf('\n', end)
  const candidates = [previousSpace, previousLine].filter(value => value >= 0 && value > 0)
  return candidates.length ? Math.max(...candidates) : end
}

const HEADING_PATTERNS = [
  /bảo\s+hành\s+(?:phụ\s+kiện|phụ\s+tùng|pin|ắc\s*[-–—]?\s*quy|sơn|gỉ\s+sét|các\s+bộ\s+phận\s+treo|lốp|xe\s+mới|ô\s+tô)/iu,
  /thời\s+hạn\s+bảo\s+hành/iu,
  /(?:quy\s+định|chính\s+sách|điều\s+kiện)\s+bảo\s+hành/iu,
  /hạng\s+mục\s+bảo\s+dưỡng/iu,
  /cứu\s+hộ/iu,
]

export function extractHeadingPath(text, index) {
  const before = text.slice(Math.max(0, index - 2000), index)
  const lines = before.split(/\n+/).map(l => l.trim()).filter(Boolean)
  const headings = []
  for (const line of lines) {
    if (line.length > 120) continue
    if (HEADING_PATTERNS.some(p => p.test(line)) || /^(?:[I|V|X]+|\d+|[A-Z])[.)]\s+/i.test(line) || /:\s*$/.test(line)) {
      headings.push(clean(line.replace(/:\s*$/, '')))
    }
  }
  return headings.slice(-2)
}

/** Keep evidence within the current sentence/paragraph; never borrow a later block. */
export function buildEvidenceContext(text, index, matchLength, {
  maxChars = DEFAULT_MAX_CHARS,
  overshootChars = DEFAULT_OVERSHOOT_CHARS,
  lineBreaksAreBoundaries = false,
} = {}) {
  const value = String(text || '')
  const matchEnd = index + matchLength
  const startBoundary = structuralStart(value, index, lineBreaksAreBoundaries)
  const endBoundary = structuralEnd(value, matchEnd, lineBreaksAreBoundaries)
  const sentence = sentenceBounds(value, startBoundary.position, endBoundary.position, index, matchLength)
  const statement = renderContext(value.slice(sentence.start, sentence.end))
  const sentenceLength = sentence.end - sentence.start
  let excerptStart = sentence.start
  let excerptEnd = sentence.end
  let clipped = false

  if (sentenceLength > maxChars + overshootChars) {
    clipped = true
    excerptStart = Math.max(sentence.start, index - Math.floor(maxChars * 0.45))
    excerptEnd = Math.min(sentence.end, matchEnd + Math.ceil(maxChars * 0.55))
    excerptStart = wordSafeStart(value, excerptStart, sentence.start)
    excerptEnd = wordSafeEnd(value, excerptEnd, sentence.end)
  }

  const headings = extractHeadingPath(value, index)

  return {
    excerpt: renderContext(value.slice(excerptStart, excerptEnd)),
    statement,
    headingPath: headings,
    index: {
      version: 'after-sales-evidence-context-v1',
      boundaryType: startBoundary.type,
      sourceStart: sentence.start,
      sourceEnd: sentence.end,
      excerptStart,
      excerptEnd,
      matchStart: index,
      matchEnd,
      maxChars,
      overshootChars,
      lineBreaksAreBoundaries,
      clipped,
      crossedFutureBoundary: false,
      headingPath: headings,
    },
  }
}
