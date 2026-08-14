export type MotorbikeVariantColorMedia = {
  image_url: string
  swatch: string
}

type ColorLike = {
  color_name?: unknown
  image_url?: unknown
  swatch?: unknown
}

type VersionLike = {
  media_by_color?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeMotorbikeVariantColorMedia(value: unknown): Record<string, MotorbikeVariantColorMedia> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([colorName, media]) => {
      const normalizedColorName = text(colorName)
      if (!normalizedColorName) return []
      if (!media || typeof media !== 'object' || Array.isArray(media)) return []
      const record = media as Record<string, unknown>
      return [[normalizedColorName, {
        image_url: text(record.image_url),
        swatch: text(record.swatch),
      }]]
    }),
  )
}

export function resolveMotorbikeVariantColorMedia(
  version: VersionLike,
  color: ColorLike,
): MotorbikeVariantColorMedia {
  const colorName = text(color.color_name)
  const mediaByColor = normalizeMotorbikeVariantColorMedia(version.media_by_color)
  const ownMedia = mediaByColor[colorName]

  return {
    // A vehicle image may be customized for a specific version × color pair.
    // If no customization exists, the color's shared/base image remains the fallback.
    image_url: text(ownMedia?.image_url) || text(color.image_url),
    // Swatches are owned by the product color CRUD. Keep the legacy combination
    // value only as a read/compatibility fallback for records saved before this contract.
    swatch: text(color.swatch) || text(ownMedia?.swatch),
  }
}

export function renameMotorbikeVariantColorMedia(
  value: unknown,
  previousName: string,
  nextName: string,
): Record<string, MotorbikeVariantColorMedia> {
  const mediaByColor = normalizeMotorbikeVariantColorMedia(value)
  const normalizedPreviousName = text(previousName)
  const normalizedNextName = text(nextName)
  if (!normalizedNextName || normalizedPreviousName === normalizedNextName || !Object.prototype.hasOwnProperty.call(mediaByColor, normalizedPreviousName)) {
    return mediaByColor
  }

  const renamed = { ...mediaByColor, [normalizedNextName]: mediaByColor[normalizedPreviousName] }
  delete renamed[normalizedPreviousName]
  return renamed
}
