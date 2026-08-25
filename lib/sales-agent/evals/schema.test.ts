import { describe, it, expect } from 'vitest'
import {
  validateEvalCase,
  parseEvalDatasetJsonl,
  type EvalCase,
} from './schema'

describe('Eval Case Schema & Dataset Validator (A19-KR-005)', () => {
  const validAnswerCase: EvalCase = {
    schemaVersion: '1.0',
    id: 'vf8-2025-charging-procedure-001',
    query: 'VF 8 đời 2025 cần làm gì trước khi cắm sạc cao áp?',
    intent: 'PROCEDURE',
    difficulty: 'MEDIUM',
    expectedBehavior: 'ANSWER',
    split: 'dev',
    serverContext: {
      locale: 'vi-VN',
      market: 'VN',
      effectiveAt: '2026-08-18T00:00:00.000Z',
    },
    filters: {
      vehicleModel: 'VF 8',
      modelYear: 2025,
      editionCode: null,
      category: 'TECHNICAL_GUIDE',
    },
    gold: {
      requiredFacts: ['Tắt động cơ xe', 'Gạt cần số về P', 'Mở nắp cổng sạc'],
      forbiddenFacts: ['Rút sạc khi đang khóa súng'],
      expectedCitations: [
        {
          documentKey: 'vinfast:VF8:2025:vi-VN',
          version: 1,
          sectionAnchor: 'sec-charging-prep',
          relevance: 3,
        },
        {
          documentKey: 'vinfast:VF8:2025:vi-VN',
          version: 1,
          sectionAnchor: 'sec-charging-warning',
          relevance: 2,
        },
      ],
      forbiddenVersions: [],
      expectedClarificationFields: [],
    },
    tags: ['manual', 'procedure', 'charging', 'vf8'],
  }

  it('validates a correct ANSWER case successfully', () => {
    const res = validateEvalCase(validAnswerCase)
    expect(res.success).toBe(true)
  })

  it('validates a correct CLARIFY case successfully', () => {
    const clarifyCase = {
      ...validAnswerCase,
      id: 'clarify-charging-spec-002',
      query: 'Xe của tôi có sạc nhanh 150kW được không?',
      intent: 'AMBIGUOUS',
      expectedBehavior: 'CLARIFY',
      gold: {
        requiredFacts: [],
        forbiddenFacts: [],
        expectedCitations: [],
        forbiddenVersions: [],
        expectedClarificationFields: ['vehicleModel'],
      },
    }
    const res = validateEvalCase(clarifyCase)
    expect(res.success).toBe(true)
  })

  it('validates a correct ABSTAIN case successfully', () => {
    const abstainCase = {
      ...validAnswerCase,
      id: 'abstain-toyota-003',
      query: 'Xe Toyota Camry hybrid sạc pin như thế nào?',
      intent: 'UNANSWERABLE',
      expectedBehavior: 'ABSTAIN',
      gold: {
        requiredFacts: [],
        forbiddenFacts: [],
        expectedCitations: [],
        forbiddenVersions: [],
        expectedClarificationFields: [],
        abstainReason: 'Câu hỏi về dòng xe ngoài hệ thống FASTLANE và VinFast.',
      },
    }
    const res = validateEvalCase(abstainCase)
    expect(res.success).toBe(true)
  })

  it('rejects invalid kebab-case ID', () => {
    const invalidCase = {
      ...validAnswerCase,
      id: 'VF8_Charging_001',
    }
    const res = validateEvalCase(invalidCase)
    expect(res.success).toBe(false)
  })

  it('rejects CLARIFY without clarification fields', () => {
    const invalidCase = {
      ...validAnswerCase,
      id: 'clarify-invalid-004',
      expectedBehavior: 'CLARIFY',
      gold: {
        ...validAnswerCase.gold,
        expectedClarificationFields: [],
      },
    }
    const res = validateEvalCase(invalidCase)
    expect(res.success).toBe(false)
  })

  it('rejects ABSTAIN without abstainReason', () => {
    const invalidCase = {
      ...validAnswerCase,
      id: 'abstain-invalid-005',
      expectedBehavior: 'ABSTAIN',
      gold: {
        ...validAnswerCase.gold,
        abstainReason: undefined,
      },
    }
    const res = validateEvalCase(invalidCase)
    expect(res.success).toBe(false)
  })

  it('parses valid and invalid lines from JSONL string correctly', () => {
    const validLine = JSON.stringify(validAnswerCase)
    const invalidLine = JSON.stringify({ ...validAnswerCase, id: 'INVALID ID' })
    const jsonl = `${validLine}\n${invalidLine}\n`

    const parsed = parseEvalDatasetJsonl(jsonl)
    expect(parsed.validCases.length).toBe(1)
    expect(parsed.invalidCount).toBe(1)
    expect(parsed.errors[0].line).toBe(2)
  })
})
