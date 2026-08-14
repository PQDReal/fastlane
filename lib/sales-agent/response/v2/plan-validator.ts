import {
  agentResponsePlanV2Schema,
  type AgentResponsePlanV2,
  type FactPointerV2,
  type PlannedNarrativeItemV2,
} from '../../contracts/v2'
import type { EvidenceLedger } from '../../orchestrator/v2/ledgers/evidence'
import type { KnownEntityLedger } from '../../orchestrator/v2/ledgers/known-entities'

export type ValidationResult = {
  valid: boolean
  plan: AgentResponsePlanV2
  warnings: Array<{ code: string; message: string }>
}

export function validateResponsePlan(
  rawPlan: unknown,
  evidence: EvidenceLedger,
  knownEntities: KnownEntityLedger,
): ValidationResult {
  const warnings: Array<{ code: string; message: string }> = []
  const parsed = agentResponsePlanV2Schema.safeParse(rawPlan)

  if (!parsed.success) {
    // If schema parsing fails, build a safe fallback plan
    const fallbackPlan: AgentResponsePlanV2 = {
      schemaVersion: '2.0',
      outcome: 'DEGRADED',
      narrative: [
        {
          kind: 'ADVICE',
          markdown: 'Không thể định dạng câu trả lời hoàn chỉnh. Vui lòng thử lại.',
        },
      ],
      views: [],
      suggestionIntents: [],
      actionIntents: [],
    }
    return {
      valid: false,
      plan: fallbackPlan,
      warnings: [{ code: 'INVALID_RESPONSE_PLAN_SCHEMA', message: parsed.error.message }],
    }
  }

  const plan = parsed.data
  const sanitizedNarrative: PlannedNarrativeItemV2[] = []

  for (const item of plan.narrative) {
    if (item.kind === 'FASTLANE_FACT') {
      const validPointers: FactPointerV2[] = []
      for (const pointer of item.facts) {
        const check = evidence.validateFactPointer(pointer)
        if (check.valid) {
          validPointers.push(pointer)
        } else {
          warnings.push({
            code: 'INVALID_FACT_POINTER',
            message: check.reason || `Fact pointer ${pointer.factRef} không hợp lệ.`,
          })
        }
      }

      if (validPointers.length > 0) {
        sanitizedNarrative.push({
          kind: 'FASTLANE_FACT',
          presentationKey: item.presentationKey,
          facts: [validPointers[0], ...validPointers.slice(1)],
        })
      }
    } else if (item.kind === 'ADVICE') {
      // Validate subjects against known entities
      const validSubjects = (item.subjects ?? []).filter((subj) =>
        knownEntities.hasEntity(subj.kind as any, subj.id),
      )
      sanitizedNarrative.push({
        kind: 'ADVICE',
        markdown: item.markdown,
        subjects: validSubjects.length > 0 ? validSubjects : undefined,
        support: item.support,
      })
    } else if (item.kind === 'LIMITATION') {
      const validObs = item.observations.filter((obs) =>
        evidence.hasObservation(obs.observationId),
      )
      if (validObs.length > 0) {
        sanitizedNarrative.push({
          kind: 'LIMITATION',
          observations: [validObs[0], ...validObs.slice(1)],
        })
      }
    }
  }

  const sanitizedPlan: AgentResponsePlanV2 = {
    ...plan,
    narrative: sanitizedNarrative.length > 0 ? sanitizedNarrative : [
      {
        kind: 'ADVICE',
        markdown: 'Dưới đây là thông tin theo catalog Fastlane.',
      },
    ],
  }

  return {
    valid: warnings.length === 0,
    plan: sanitizedPlan,
    warnings,
  }
}
