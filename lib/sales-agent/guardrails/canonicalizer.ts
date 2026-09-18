export type DetectionViews = {
  raw: string
  normalizedNfkc: string
  strippedInvisible: string
  collapsedSpacedLetters: string
  confusableNormalized: string
  unaccentedVietnamese: string
  unaccentedCollapsed: string
  denseNoSpaces: string
  decodedFragments: string[]
  hasInvisibleChars: boolean
  hasSuspiciousEncoding: boolean
}

// Cyrillic / Greek confusable mapping to Latin (subset of UTS #39)
const CONFUSABLE_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0410': 'A', // Cyrillic a
  '\u0435': 'e', '\u0415': 'E', // Cyrillic e
  '\u043E': 'o', '\u041E': 'O', // Cyrillic o
  '\u0440': 'p', '\u0420': 'P', // Cyrillic p
  '\u0441': 'c', '\u0421': 'C', // Cyrillic c
  '\u0443': 'y', '\u0423': 'Y', // Cyrillic y
  '\u0445': 'x', '\u0425': 'X', // Cyrillic x
  '\u0456': 'i', '\u0406': 'I', // Cyrillic i
  '\u03BF': 'o', '\u039F': 'O', // Greek omicron
  '\u03B1': 'a', '\u0391': 'A', // Greek alpha
  '\u03BD': 'v', '\u039D': 'N', // Greek nu
}

const INVISIBLE_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/g

export function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

export function buildDetectionViews(input: string): DetectionViews {
  const raw = (input || '').slice(0, 4000)
  const normalizedNfkc = raw.normalize('NFKC')

  // 1. Detect and strip invisible characters
  const hasInvisibleChars = INVISIBLE_REGEX.test(raw)
  const strippedInvisible = normalizedNfkc.replace(INVISIBLE_REGEX, '')

  // 2. Confusable normalization
  let confusableNormalized = ''
  for (const char of strippedInvisible) {
    confusableNormalized += CONFUSABLE_MAP[char] ?? char
  }

  // 3. Normalized punctuation view (replace underscores/dashes/symbols with single spaces)
  const punctuationNormalized = confusableNormalized.replace(/[\s_\-.,/|\\~`*#]+/g, ' ').trim()

  // 4. Collapse spaced single letters: e.g. "b ỏ q u a m ọ i h ư ớ n g d ẫ n" -> "bỏ qua mọi hướng dẫn"
  const collapsedSpacedLetters = punctuationNormalized.replace(
    /\b([\p{L}\p{N}])\s+(?=[\p{L}\p{N}]\b)/gu,
    '$1',
  )

  // 5. Vietnamese unaccented views
  const unaccentedVietnamese = removeVietnameseDiacritics(confusableNormalized)
  const unaccentedCollapsed = removeVietnameseDiacritics(collapsedSpacedLetters)

  // 6. Dense no-spaces view (strips all whitespace and punctuation)
  const denseNoSpaces = unaccentedVietnamese.replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase()

  // 7. Safe fragment decoding (Base64 / Hex / URL-encoded)
  const decodedFragments: string[] = []
  let hasSuspiciousEncoding = false

  // URL-encoded detection (e.g. %20ignore%20all)
  if (raw.includes('%')) {
    try {
      const decodedUrl = decodeURIComponent(raw)
      if (decodedUrl !== raw) {
        decodedFragments.push(decodedUrl)
        hasSuspiciousEncoding = true
      }
    } catch {
      // ignore malformed URI
    }
  }

  // Base64 fragment detection (min 16 chars, max 300 chars, valid base64 pattern)
  const base64Matches = raw.match(/[A-Za-z0-9+/]{16,}={0,2}/g)
  if (base64Matches) {
    for (const token of base64Matches.slice(0, 3)) {
      if (token.length <= 300) {
        try {
          const decoded = Buffer.from(token, 'base64').toString('utf8')
          // Check if decoded content looks like printable text
          if (/^[\p{L}\p{N}\s.,?!:;-_/\\'"()]{6,}$/u.test(decoded)) {
            decodedFragments.push(decoded)
            hasSuspiciousEncoding = true
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    raw,
    normalizedNfkc,
    strippedInvisible,
    collapsedSpacedLetters,
    confusableNormalized,
    unaccentedVietnamese,
    unaccentedCollapsed,
    denseNoSpaces,
    decodedFragments,
    hasInvisibleChars,
    hasSuspiciousEncoding,
  }
}
