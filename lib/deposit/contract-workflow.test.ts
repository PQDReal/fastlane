import { describe, expect, it } from 'vitest'
import { getDepositContractMode } from './contract-workflow'

describe('deposit contract workflow', () => {
  it('uses the car sales contract for cars', () => expect(getDepositContractMode({ vehicle_type: 'car' })).toBe('CAR_SALES'))
  it('uses the battery rental agreement for rented batteries', () => expect(getDepositContractMode({ vehicle_type: 'motorbike', car_variant: 'Không kèm Pin (Thuê pin)' })).toBe('BIKE_BATTERY_RENTAL'))
  it('uses purchase terms for battery-included bikes', () => expect(getDepositContractMode({ vehicle_type: 'motorbike', car_variant: 'Mua Pin' })).toBe('BIKE_PURCHASE_TERMS'))
})
