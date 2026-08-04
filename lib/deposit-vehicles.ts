import {
  getBikeColorImage,
  getBikeListingImage,
  parseBikeImageUrls,
} from './bike-images'
import motorbikeImageManifest from '../scripts/data/motorbike-image-manifest.json'

export type DepositVehicleType = 'car' | 'motorbike'

type UnknownRecord = Record<string, any>

const motorbikeImagesBySlug = new Map(
  motorbikeImageManifest.map((entry) => [entry.slug, entry]),
)

export function mergeMotorbikeDatabaseRows(
  publishedMotorbikes: UnknownRecord[],
  databaseRows: UnknownRecord[],
): UnknownRecord[] {
  if (databaseRows.length === 0) return publishedMotorbikes

  return databaseRows.map((row) => {
    const published = publishedMotorbikes.find(
      (candidate) => depositVehicleKey(candidate.name) === depositVehicleKey(row.name),
    ) ?? {}
    const specifications =
      row.specifications && typeof row.specifications === 'object' && !Array.isArray(row.specifications)
        ? row.specifications
        : {}
    const databaseColorDetails = Array.isArray(specifications.color_details)
      ? specifications.color_details
      : []
    const databaseColorNames = databaseColorDetails
      .map((detail: UnknownRecord) =>
        String(detail?.color_name ?? detail?.name ?? '').trim(),
      )
      .filter(Boolean)
    const variants = Array.isArray(row.product_variants)
      ? row.product_variants.filter((variant: UnknownRecord) => variant.is_active !== false)
      : []
    const variantNames = variants
      .map((variant: UnknownRecord) => String(variant.name ?? '').trim())
      .filter(Boolean)
    const variantPricesByName = Object.fromEntries(
      variants.map((variant: UnknownRecord) => [
        String(variant.name ?? '').trim(),
        parseVndAmount(variant.sale_price) || parseVndAmount(variant.original_price),
      ]),
    )
    const variantPrices = variants
      .map((variant: UnknownRecord) =>
        parseVndAmount(variant.sale_price) || parseVndAmount(variant.original_price),
      )
      .filter((price: number) => price > 0)
    const displayedPrice = parseVndAmount(row.displayed_price)
      || (variantPrices.length > 0 ? Math.min(...variantPrices) : 0)
    const depositValue = variants
      .map((variant: UnknownRecord) => parseVndAmount(variant.deposit_amount))
      .find((value: number) => value > 0)

    return {
      ...published,
      ...specifications,
      name: row.name,
      slug: row.slug,
      images: Array.isArray(row.image_urls) ? row.image_urls : [],
      image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
      colors:
        databaseColorNames.length > 0
          ? databaseColorNames
          : specifications.colors || published.colors || [],
      color_details:
        databaseColorDetails.length > 0
          ? databaseColorDetails
          : specifications.color_details || published.color_details || [],
      displayed_price: displayedPrice,
      deposit_value: depositValue || specifications.deposit_value || published.deposit_value,
      variants: variantNames.length > 0 ? variantNames : specifications.variants || published.variants,
      variant_prices: variantPricesByName,
    }
  })
}

export function depositVehicleKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/vinfast\s*/g, '')
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
    const manifestImages = motorbikeImagesBySlug.get(slug)
    const colorDetails = Array.isArray(motorbike.color_details)
      ? motorbike.color_details
      : []
    const colorsFromDetails = colorDetails
      .map((detail: UnknownRecord) => ({
        name: String(detail?.color_name ?? detail?.name ?? '').trim(),
        image: String(detail?.image_url ?? detail?.image ?? '').trim(),
        swatch: String(detail?.swatch ?? '').trim() || undefined,
      }))
      .filter((detail: UnknownRecord) => detail.name !== '')
    const rawColors =
      colorsFromDetails.length > 0
        ? colorsFromDetails
        : Array.isArray(motorbike.colors) && motorbike.colors.length > 0
          ? motorbike.colors
          : String(motorbike.specs?.['Màu sắc'] ?? '')
              .split(/[;,]/)
              .map((color) => color.trim())
              .filter(Boolean)
    const colorNames = rawColors.map((rawColor: unknown) =>
      typeof rawColor === 'string'
        ? rawColor
        : String((rawColor as UnknownRecord)?.name ?? ''),
    )
    const databaseImages = parseBikeImageUrls(
      motorbike.image_urls || motorbike.images,
      colorNames,
    )
    const fallbackImage =
      databaseImages.listingImage ||
      getBikeListingImage(
        slug,
        motorbike.images,
        firstUsableImage(motorbike),
      ) ||
      manifestImages?.listingImage ||
      manifestImages?.heroImage ||
      ''
    const colors = databaseImages.followsOrderedContract
      ? databaseImages.colorImages.map((detail) => ({
          name: detail.colorName,
          image: detail.imageUrl,
          swatch: detail.swatchUrl,
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
            const manifestColor = manifestImages?.colors.find(
              (candidate) =>
                depositVehicleKey(candidate.name) === depositVehicleKey(name),
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
                    manifestColor?.imageUrl ||
                    '',
                ) || fallbackImage,
              swatch:
                detail?.swatch ||
                rawColorObject.swatch ||
                manifestColor?.swatchUrl ||
                undefined,
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
            price:
              parseVndAmount(motorbike.variant_prices?.[variant])
              || parseVndAmount(variant)
              || fallbackPrice,
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
