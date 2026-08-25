import type { KnowledgeEvidenceItem } from '../retrieval/contracts'
import { validateCitationPointer } from '../retrieval/citation-ledger'

export interface GroundingCheckInput {
  query: string
  answerText: string
  retrievedEvidence: KnowledgeEvidenceItem[]
  citedPointers: string[]
  expectedModel?: string
  isUnanswerable?: boolean
}

export interface GroundingGradeResult {
  groundednessScore: number // 0.0 to 1.0
  citationPrecision: number // 0.0 to 1.0
  wrongModelViolation: boolean
  hallucinatedPointersCount: number
  unsupportedClaims: string[]
  passedGate: boolean
  feedback: string
  calibrationStatus: 'UN_CALIBRATED_HEURISTIC'
}

export class E2EAnswerGrader {
  /**
   * Đánh giá chất lượng toàn diện của câu trả lời Sales Agent
   */
  gradeAnswer(input: GroundingCheckInput): GroundingGradeResult {
    const cleanAnswer = (input.answerText || '').trim()
    const cleanAnswerLower = cleanAnswer.toLowerCase()
    const unsupportedClaims: string[] = []

    // 1. Kiểm tra Trích Dẫn Hợp Lệ trước mọi nhánh (kể cả unanswerable).
    // Một câu từ chối không được dùng để che pointer giả mạo.
    const validPointers = new Set(input.retrievedEvidence.map((e) => e.citationId))
    let validPointersCount = 0
    let hallucinatedPointersCount = 0
    for (const pointer of input.citedPointers) {
      if (!validateCitationPointer(pointer) || !validPointers.has(pointer)) {
        hallucinatedPointersCount++
        unsupportedClaims.push(
          !validateCitationPointer(pointer)
            ? `Định dạng pointer không hợp lệ: ${pointer}`
            : `Pointer bịa mạo (không nằm trong bằng chứng thực tế): ${pointer}`,
        )
      } else {
        validPointersCount++
      }
    }
    const citationPrecision =
      input.citedPointers.length > 0
        ? validPointersCount / input.citedPointers.length
        : input.retrievedEvidence.length > 0
          ? 0.5
          : 1.0

    // 2. Kiểm tra trường hợp Không Thể Trả Lời (Unanswerable / Out of Scope)
    if (input.isUnanswerable) {
      const refusalPhrases = [
        'chưa có thông tin',
        'không tìm thấy',
        'liên hệ',
        'chưa được cập nhật',
        'vui lòng thử lại',
        'không hỗ trợ',
        'lưu ý',
      ]
      const didAbstain = refusalPhrases.some((phrase) => cleanAnswerLower.includes(phrase))
      const cleanAbstention = didAbstain && input.citedPointers.length === 0 && hallucinatedPointersCount === 0
      return {
        groundednessScore: cleanAbstention ? 1.0 : 0.2,
        citationPrecision,
        wrongModelViolation: false,
        hallucinatedPointersCount,
        unsupportedClaims: cleanAbstention
          ? []
          : [...unsupportedClaims, ...(didAbstain ? ['Câu từ chối không được kèm trích dẫn khi không có bằng chứng'] : ['Câu trả lời bịa đặt thông tin khi hệ thống không có dữ liệu'])],
        passedGate: cleanAbstention,
        calibrationStatus: 'UN_CALIBRATED_HEURISTIC',
        feedback: cleanAbstention
          ? 'Đã từ chối/nêu giới hạn đúng chuẩn khi không có dữ liệu.'
          : 'Thất bại: Đã tự bịa câu trả lời cho câu hỏi ngoài phạm vi hoặc kèm pointer không hợp lệ.',
      }
    }

    // 3. Kiểm tra Sai Lệch Dòng Xe (Wrong Model Violation)
    let wrongModelViolation = false
    if (input.expectedModel) {
      const expectedNormalized = input.expectedModel.toLowerCase().replace(/\s+/g, '')
      const otherModels = ['vf3', 'vf5', 'vf6', 'vf7', 'vf8', 'vf9', 'vfe34'].filter(
        (m) => m !== expectedNormalized
      )

      // Nếu câu trả lời nhắc đến dòng xe khác nhưng không nhắc dòng xe được hỏi
      const mentionsExpected = cleanAnswerLower.replace(/\s+/g, '').includes(expectedNormalized)
      const mentionsOthers = otherModels.filter((m) =>
        cleanAnswerLower.replace(/\s+/g, '').includes(m)
      )

      if (!mentionsExpected && mentionsOthers.length > 0) {
        wrongModelViolation = true
        unsupportedClaims.push(`Sai dòng xe: Hỏi về ${input.expectedModel} nhưng trả lời về ${mentionsOthers.join(', ')}`)
      }
    }

    // 4. Đo lường Groundedness (Sự gắn kết với bằng chứng)
    let matchedKeywords = 0
    let totalKeywords = 0
    const evidenceText = input.retrievedEvidence
      .map((e) => `${e.title} ${e.sectionTitle} ${e.content}`)
      .join(' ')
      .toLowerCase()

    // Trích xuất các số liệu và thuật ngữ quan trọng trong câu trả lời
    const numbersAndTerms = cleanAnswer.match(/\b\d+(\.\d+)?\s*(km|năm|tháng|triệu|kw|kwh|%|vnđ|v)\b/gi) || []
    for (const term of numbersAndTerms) {
      totalKeywords++
      if (evidenceText.includes(term.toLowerCase())) {
        matchedKeywords++
      } else {
        unsupportedClaims.push(`Số liệu/Thuật ngữ không tìm thấy trong tài liệu: "${term}"`)
      }
    }

    const stopWords = new Set([
      'của', 'và', 'cho', 'với', 'trên', 'dưới', 'theo', 'được', 'là', 'có',
      'một', 'các', 'này', 'khi', 'trong', 'từ', 'xe', 'pin', 'xin', 'hãy',
    ])
    const answerTokens = Array.from(new Set(cleanAnswerLower.match(/[\p{L}\p{N}]+/gu) || []))
      .filter((token) => token.length >= 3 && !stopWords.has(token))
    const evidenceTokens = new Set(evidenceText.match(/[\p{L}\p{N}]+/gu) || [])
    const overlappingTokens = answerTokens.filter((token) => evidenceTokens.has(token)).length
    const lexicalCoverage = answerTokens.length > 0 ? overlappingTokens / answerTokens.length : 0
    const numericCoverage = totalKeywords > 0 ? matchedKeywords / totalKeywords : lexicalCoverage
    const keywordGroundedness = totalKeywords > 0
      ? numericCoverage * 0.7 + lexicalCoverage * 0.3
      : lexicalCoverage
    if (answerTokens.length > 0 && lexicalCoverage < 0.25) {
      unsupportedClaims.push('Nội dung trả lời có ít thuật ngữ trùng khớp với bằng chứng đã truy xuất')
    }

    // Tổng hợp điểm Groundedness
    let groundednessScore = keywordGroundedness
    if (wrongModelViolation) groundednessScore = Math.min(groundednessScore, 0.2)
    if (hallucinatedPointersCount > 0) groundednessScore = Math.min(groundednessScore, 0.4)

    const passedGate =
      groundednessScore >= 0.7 &&
      citationPrecision >= 0.7 &&
      !wrongModelViolation &&
      hallucinatedPointersCount === 0

    return {
      groundednessScore: Math.round(groundednessScore * 100) / 100,
      citationPrecision: Math.round(citationPrecision * 100) / 100,
      wrongModelViolation,
      hallucinatedPointersCount,
      unsupportedClaims,
      passedGate,
      calibrationStatus: 'UN_CALIBRATED_HEURISTIC',
      feedback: passedGate
        ? 'Câu trả lời bám sát bằng chứng, trích dẫn chính xác và không có vi phạm dòng xe.'
        : `Phát hiện lỗi: ${unsupportedClaims.join('; ')}`,
    }
  }
}
