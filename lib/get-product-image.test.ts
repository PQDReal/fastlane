import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { getCarSpecsSummary, getProductImage } from './get-product-image'

describe('database-backed vehicle card helpers', () => {
  it('builds the car summary from persisted specifications', () => {
    expect(getCarSpecsSummary({ seat_count: 5, range_text: '562 km (NEDC)' }))
      .toBe('5 chỗ | ~562 km/lần sạc')
  })

  it('uses persisted product imagery and an explicit fallback', () => {
    expect(getProductImage('Future model', ['https://cdn.example.com/car.webp']))
      .toBe('https://cdn.example.com/car.webp')
    expect(getProductImage('Future model', [])).toBe('/images/vf8.png')
  })

  it('keeps legacy JSON reads out of homepage and card request paths', () => {
    const homeSource = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8')
    const helperSource = fs.readFileSync(path.join(process.cwd(), 'lib/get-product-image.ts'), 'utf8')

    expect(homeSource).not.toContain('readFileSync')
    expect(homeSource).not.toContain('master_car_specs.json')
    expect(homeSource).not.toContain("by_type', 'cars.json")
    expect(homeSource).toContain("['home-vehicle-catalog-v1']")
    expect(helperSource).not.toMatch(/from ['"](?:node:)?fs['"]/) 
  })
})
