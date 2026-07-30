export type BikeColorImage = {
  colorName: string
  imageUrl: string
  swatchUrl: string
}

export type BikeImageSet = {
  listingImage: string
  heroImage: string
  colorImages: BikeColorImage[]
  detailImages: string[]
  followsOrderedContract: boolean
}

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/i
const SMALL_SWATCH_IMAGE =
  /\/Sites-app_vinfast_vn-Library\/default\/[^/]+\/images\/XMD\/[^/]+\/[^/]+\.png(?:\?.*)?$/i
const DETAIL_IMAGE =
  /\/(?:feature|spec|img-part)[-_]?(?:0?[1-4])\.(?:avif|jpe?g|png|webp)(?:\?.*)?$/i

export function isRenderableBikeImage(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  const url = value.trim()
  return url.startsWith('data:image/')
    || url.startsWith('/')
    || IMAGE_EXTENSION.test(url)
}

function renderableImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRenderableBikeImage)
    .map((url) => url.trim())
}

function uniqueImages(values: unknown[]): string[] {
  return [...new Set(values.filter(isRenderableBikeImage).map((url) => url.trim()))]
}

/**
 * Supabase products.image_urls contract for motorbikes:
 *
 * [0] listing image
 * [1] hero image
 * [2...] one full-bike image + one swatch for every color, in the same order
 * [last 3] detail images
 */
export function parseBikeImageUrls(
  imageUrls: unknown,
  colorNames: string[],
): BikeImageSet {
  const slots = Array.isArray(imageUrls)
    ? imageUrls.map((value) => typeof value === 'string' ? value.trim() : '')
    : []
  const images = slots.filter(isRenderableBikeImage)
  const expectedLength = 2 + colorNames.length * 2 + 3
  const followsOrderedContract =
    colorNames.length > 0
    && slots.length === expectedLength
    && slots.every(isRenderableBikeImage)

  if (followsOrderedContract) {
    const colorImages = colorNames.map((colorName, index) => ({
      colorName,
      imageUrl: slots[2 + index * 2],
      swatchUrl: slots[3 + index * 2],
    }))
    const detailStart = 2 + colorNames.length * 2

    return {
      listingImage: slots[0],
      heroImage: slots[1],
      colorImages,
      detailImages: slots.slice(detailStart, detailStart + 3),
      followsOrderedContract: true,
    }
  }

  const fallbackListing = isRenderableBikeImage(slots[0]) ? slots[0] : ''
  const fallbackHero = isRenderableBikeImage(slots[1]) ? slots[1] : fallbackListing
  return {
    listingImage: fallbackListing,
    heroImage: fallbackHero,
    colorImages: [],
    detailImages: uniqueImages(images.filter((url) => DETAIL_IMAGE.test(url))).slice(0, 3),
    followsOrderedContract: false,
  }
}

export function getBikeListingImage(
  _slug: string,
  imageUrls: unknown,
  fallback: string,
): string {
  const first = Array.isArray(imageUrls) ? imageUrls[0] : null
  return isRenderableBikeImage(first) ? first.trim() : fallback
}

export function getBikeHeroImage(
  _slug: string,
  imageUrlsOrBannerImages: unknown,
  listingImage: string,
): { src: string; contain: boolean } {
  const images = renderableImages(imageUrlsOrBannerImages)
  return {
    src: images[1] ?? images[0] ?? listingImage,
    contain: images.length < 2,
  }
}

export function getBikeDetailImages(
  _slug: string,
  candidates: unknown[],
): string[] {
  return uniqueImages(candidates)
    .filter((url) => DETAIL_IMAGE.test(url))
    .slice(0, 3)
}

export function isBikeSwatchImage(value: string): boolean {
  return SMALL_SWATCH_IMAGE.test(value)
}

export function getBikeColorImage(
  _slug: string,
  _colorName: string,
  candidate: string,
): string | null {
  if (!isRenderableBikeImage(candidate) || isBikeSwatchImage(candidate)) {
    return null
  }
  return candidate.trim()
}
