import { describe, expect, it } from 'vitest'
import {
  applySalesAgentVehicleSlots,
  inferSalesAgentIntent,
  resolveSalesAgentConversationState,
} from './state'

describe('sales agent conversation intent and slot continuity', () => {
  it('inherits compare intent and normalizes comparison criteria for an entity-only follow-up', () => {
    const state = resolveSalesAgentConversationState('VF7 và VF8', [
      { role: 'user', content: 'So sánh pin và tốc độ' },
      { role: 'assistant', content: 'Bạn muốn chọn xe nào?' },
    ], { now: '2026-08-13T00:00:00.000Z' })

    expect(state).toEqual({
      schemaVersion: '1.0',
      activeIntent: 'COMPARE_VEHICLES',
      slots: { criteria: ['battery_capacity_kwh', 'top_speed_kmh'] },
      updatedAt: '2026-08-13T00:00:00.000Z',
    })
  })

  it('lets a current explicit intent replace the previous topic', () => {
    const state = resolveSalesAgentConversationState('Thôi, xem khuyến mãi', [
      { role: 'user', content: 'So sánh VF7 và VF8' },
    ], { now: '2026-08-13T00:00:00.000Z' })

    expect(state.activeIntent).toBe('PROMOTIONS')
    expect(state.slots.criteria).toBeUndefined()
  })

  it('gives interaction state priority over prose history', () => {
    const state = resolveSalesAgentConversationState('VF5', [
      { role: 'user', content: 'So sánh VF7 và VF8' },
    ], {
      interactionState: {
        activeIntent: 'VEHICLE_DETAILS',
        slots: { vehicleIds: ['vf5'] },
        pendingInteractionId: 'interaction-1',
      },
      now: '2026-08-13T00:00:00.000Z',
    })

    expect(state.activeIntent).toBe('VEHICLE_DETAILS')
    expect(state.slots.vehicleIds).toEqual(['vf5'])
    expect(state.pendingInteractionId).toBe('interaction-1')
  })

  it('has no version or year slot when only model-level criteria are available', () => {
    const state = resolveSalesAgentConversationState('So sánh phiên bản và năm VF7 với VF8', [], { now: '2026-08-13T00:00:00.000Z' })

    expect(state.activeIntent).toBe('COMPARE_VEHICLES')
    expect(state.slots).not.toHaveProperty('version')
    expect(state.slots).not.toHaveProperty('year')
  })

  it('replaces vehicle slots explicitly and caps compare slots at three IDs', () => {
    const state = resolveSalesAgentConversationState('So sánh VF7 và VF8', [], { now: '2026-08-13T00:00:00.000Z' })
    const replaced = applySalesAgentVehicleSlots(state, ['vf5'])
    const appended = applySalesAgentVehicleSlots(replaced, ['vf7', 'vf8', 'vf9', 'vf10'], 'append')

    expect(replaced.slots.vehicleIds).toEqual(['vf5'])
    expect(appended.slots.vehicleIds).toEqual(['vf8', 'vf9', 'vf10'])
  })

  it('classifies explicit intents without inventing one for an entity-only message', () => {
    expect(inferSalesAgentIntent('So sánh pin và tốc độ')).toBe('COMPARE_VEHICLES')
    expect(inferSalesAgentIntent('Thông số VF8')).toBe('VEHICLE_DETAILS')
    expect(inferSalesAgentIntent('VF7 và VF8')).toBeUndefined()
  })
})
