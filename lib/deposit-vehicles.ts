import {
  getBikeColorFallbacks,
  getBikeColorImage,
  getBikeListingImage,
} from './bike-images'

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

function firstUsableImage(vehicle: UnknownRecord): string {
  const candidates = [
    vehicle.representative_image,
    vehicle.image,
    ...(Array.isArray(vehicle.images) ? vehicle.images : []),
    ...(Array.isArray(vehicle.gallery?.exterior_images) ? vehicle.gallery.exterior_images : []),
    ...(Array.isArray(vehicle.gallery?.all_images) ? vehicle.gallery.all_images : []),
  ]

  return (
    candidates.find(
      (candidate) =>
        typeof candidate === 'string' &&
        candidate.trim() !== '' &&
        !candidate.toLowerCase().includes('swatch') &&
        !candidate.toLowerCase().endsWith('.svg'),
    ) ?? ''
  )
}

function motorbikeSlug(motorbike: UnknownRecord): string {
  if (typeof motorbike.slug === 'string' && motorbike.slug.trim() !== '') {
    return motorbike.slug.trim()
  }

  const key = depositVehicleKey(motorbike.name)
  const exceptions: Record<string, string> = {
    evogrand: 'evo-grand',
    verox: 'vero-x',
  }

  return (
    exceptions[key] ||
    String(motorbike.name ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  )
}

export function normalizeMotorbikesForDeposit(motorbikes: UnknownRecord[]) {
  return motorbikes.map((motorbike) => {
    const slug = motorbikeSlug(motorbike)
    const fallbackImage = getBikeListingImage(
      slug,
      motorbike.images,
      firstUsableImage(motorbike),
    )
    const colorDetails = Array.isArray(motorbike.color_details)
      ? motorbike.color_details
      : []
    const rawColors =
      Array.isArray(motorbike.colors) && motorbike.colors.length > 0
        ? motorbike.colors
        : String(motorbike.specs?.['Màu sắc'] ?? '')
            .split(/[;,]/)
            .map((color) => color.trim())
            .filter(Boolean)
    const fallbackColorDetails = getBikeColorFallbacks(slug)
    const colors =
      fallbackColorDetails.length > 0
        ? fallbackColorDetails.map((detail) => ({
            name: detail.colorName,
            image: detail.imageUrl,
            swatch: detail.swatchUrl || undefined,
          }))
        : rawColors.map((rawColor: unknown) => {
            const rawColorObject =
              typeof rawColor === 'object' && rawColor !== null
                ? (rawColor as UnknownRecord)
                : {}
            const name =
              typeof rawColor === 'string'
                ? rawColor
                : String(rawColorObject.name ?? '')
            const detail = colorDetails.find(
              (candidate: UnknownRecord) =>
                depositVehicleKey(candidate?.color_name ?? candidate?.name) ===
                depositVehicleKey(name),
            )

            return {
              name,
              image:
                getBikeColorImage(
                  slug,
                  name,
                  detail?.image_url ||
                    detail?.image ||
                    rawColorObject.image ||
                    '',
                ) || fallbackImage,
              swatch:
                detail?.swatch || rawColorObject.swatch || undefined,
            }
          })
    const variants =
      Array.isArray(motorbike.variants) && motorbike.variants.length > 0
        ? motorbike.variants
        : ['Bản tiêu chuẩn']
    const displayedPrice =
      parseVndAmount(motorbike.base_price) ||
      parseVndAmount(motorbike.displayed_price) ||
      parseVndAmount(motorbike.price)
    const depositValue =
      parseVndAmount(motorbike.deposit_value) ||
      parseVndAmount(motorbike.deposit) ||
      2_000_000

    return {
      ...motorbike,
      name: String(motorbike.name ?? ''),
      slug,
      product_type: 'motorbike' as const,
      colors,
      variants,
      displayed_price: displayedPrice,
      deposit_value: depositValue,
      image_url: fallbackImage,
      optional_packages: [],
      gallery: {
        ...(motorbike.gallery ?? {}),
        exterior_images: Array.from(
          new Set([
            ...colors.map((color: UnknownRecord) => color.image).filter(Boolean),
            ...(Array.isArray(motorbike.gallery?.exterior_images)
              ? motorbike.gallery.exterior_images
              : []),
          ]),
        ),
        interior_images: [],
      },
    }
  })
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
            price: parseVndAmount(variant) || fallbackPrice,
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
