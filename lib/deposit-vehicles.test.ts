import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildMotorbikeDepositSpecs,
  depositVehicleKey,
  findDepositVehicle,
  mergeMotorbikeDatabaseRows,
  normalizeMotorbikesForDeposit,
  parseVndAmount,
} from './deposit-vehicles'

describe('deposit vehicle helpers', () => {
  it('matches equivalent model names with different spacing', () => {
    expect(depositVehicleKey('Evo Grand')).toBe(depositVehicleKey('EvoGrand'))
    expect(findDepositVehicle([{ name: 'EvoGrand' }], 'Evo Grand')?.name).toBe(
      'EvoGrand',
    )
  })

  it('normalizes motorbike colors, prices and deposit values', () => {
    const [bike] = normalizeMotorbikesForDeposit([
      {
        name: 'Test Bike',
        price: '11.600.000 VNĐ',
        deposit: '2.000.000 VNĐ',
        colors: ['Đỏ tươi'],
        variants: ['Bản tiêu chuẩn: 11.600.000 VNĐ'],
        representative_image: 'https://example.com/amio.webp',
        color_details: [],
      },
    ])

    expect(bike.name).toBe('Test Bike')
    expect(bike.displayed_price).toBe(11_600_000)
    expect(bike.deposit_value).toBe(2_000_000)
    expect(bike.colors[0]).toMatchObject({
      name: 'Đỏ tươi',
      image: 'https://example.com/amio.webp',
    })
  })

  it('builds variant pricing and specifications for the shared deposit UI', () => {
    const [bike] = normalizeMotorbikesForDeposit([
      {
        name: 'Evo Neo',
        price: 'Kèm Pin: 17.800.000 VNĐ',
        variants: ['Không kèm Pin: 12.200.000 VNĐ'],
        colors: [],
        specs: {
          'Công suất tối đa': '1600 W',
          'Quãng đường đi được mỗi lần sạc': '78 km',
        },
      },
    ])
    const specs = buildMotorbikeDepositSpecs([bike])

    expect(parseVndAmount('12.200.000 VNĐ')).toBe(12_200_000)
    expect(specs['Evo Neo'].variants['Không kèm Pin: 12.200.000 VNĐ']).toMatchObject(
      {
        price: 12_200_000,
        specs: { powertrain: { maxPower: '1600 W', distance: '78 km' } },
      },
    )
  })

  it('prefers Supabase image_urls and variants over published JSON', () => {
    const images = Array.from(
      { length: 7 },
      (_, index) => `https://example.com/image-${index}.webp`,
    )
    const merged = mergeMotorbikeDatabaseRows(
      [{ name: 'Amio', images: ['https://example.com/legacy.webp'] }],
      [{
        name: 'Amio',
        slug: 'amio',
        displayed_price: 11_600_000,
        image_urls: images,
        specifications: { colors: ['Đỏ'] },
        product_variants: [{
          name: 'Bản tiêu chuẩn',
          original_price: 11_600_000,
          sale_price: null,
          deposit_amount: 2_000_000,
          is_active: true,
        }],
      }],
    )

    expect(merged[0]).toMatchObject({
      images,
      variants: ['Bản tiêu chuẩn'],
      displayed_price: 11_600_000,
      deposit_value: 2_000_000,
    })
  })

  it('uses Supabase color details and ordered image pairs instead of stale published colors', () => {
    const images = [
      'https://example.com/listing.webp',
      'https://example.com/hero.webp',
      'https://example.com/red-bike.webp',
      'https://example.com/red-swatch.png',
      'https://example.com/white-bike.webp',
      'https://example.com/white-swatch.png',
      'https://example.com/detail-1.webp',
      'https://example.com/detail-2.webp',
      'https://example.com/detail-3.webp',
    ]
    const merged = mergeMotorbikeDatabaseRows(
      [{ name: 'Test Bike', colors: ['Màu cũ'] }],
      [{
        name: 'Test Bike',
        slug: 'test-bike',
        image_urls: images,
        specifications: {
          color_details: [
            {
              color_name: 'Đỏ tươi',
              image_url: 'https://example.com/ignored-red.webp',
              swatch: 'https://example.com/ignored-red.png',
            },
            {
              color_name: 'Trắng ngọc trai',
              image_url: 'https://example.com/ignored-white.webp',
              swatch: 'https://example.com/ignored-white.png',
            },
          ],
        },
        product_variants: [],
      }],
    )
    const [bike] = normalizeMotorbikesForDeposit(merged)

    expect(bike.colors).toEqual([
      {
        name: 'Đỏ tươi',
        image: 'https://example.com/red-bike.webp',
        swatch: 'https://example.com/red-swatch.png',
      },
      {
        name: 'Trắng ngọc trai',
        image: 'https://example.com/white-bike.webp',
        swatch: 'https://example.com/white-swatch.png',
      },
    ])
  })
  it('normalizes all 18 published motorbikes into selectable deposit vehicles', () => {
    const source = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'public', 'data', 'by_type', 'motorbikes.json'),
        'utf8',
      ),
    )
    const bikes = normalizeMotorbikesForDeposit(source)

    expect(bikes).toHaveLength(18)
    for (const bike of bikes) {
      expect(bike.name).not.toBe('')
      expect(bike.variants.length).toBeGreaterThan(0)
      expect(bike.colors.length).toBeGreaterThan(0)
      expect(bike.colors.every((color: { image: string }) => color.image !== '')).toBe(
        true,
      )
    }
  })
})
