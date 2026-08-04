export type DepositVehicleType = 'car' | 'motorbike'

type UnknownRecord = Record<string, any>

export function depositVehicleKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function parseVndAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  const match = String(value ?? '').match(/\d{1,3}(?:[.,]\d{3})+/)
  if (!match) return 0

  return Number(match[0].replace(/[.,]/g, '')) || 0
}

export function buildMotorbikeDepositSpecs(motorbikes: UnknownRecord[]) {
  return Object.fromEntries(
    motorbikes.map((motorbike) => {
      const variants = Array.isArray(motorbike.variants)
        ? motorbike.variants
        : ['Bản tiêu chuẩn']
      const fallbackPrice = parseVndAmount(motorbike.displayed_price)
      const variantSpecs = Object.fromEntries(
        variants.map((variant: string) => [
          variant,
          {
            price:
              parseVndAmount(motorbike.variant_prices?.[variant]) ||
              parseVndAmount(variant) ||
              fallbackPrice,
            specs: {
              powertrain: {
                maxPower:
                  motorbike.specs?.['Công suất tối đa'] ||
                  motorbike.specs?.['Công suất danh định'] ||
                  '',
                distance:
                  motorbike.specs?.['Quãng đường đi được mỗi lần sạc'] || '',
              },
              dimension: {
                wheelbase:
                  motorbike.specs?.['Khoảng cách trục bánh Trước-Sau'] || '',
              },
            },
          },
        ]),
      )

      return [motorbike.name, { variants: variantSpecs }]
    }),
  )
}

export function findDepositVehicle<T extends { name?: string }>(
  vehicles: T[],
  model: unknown,
): T | undefined {
  const key = depositVehicleKey(model)
  if (!key) return undefined
  return vehicles.find((vehicle) => depositVehicleKey(vehicle.name) === key)
}
