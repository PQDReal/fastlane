import { notFound } from 'next/navigation'
import { Header } from '../../../components/header'
import { Footer } from '../../../components/footer'
import Link from 'next/link'
import { BikeColorSelector } from '../../../components/bike-color-selector'
import { getSupabaseAdmin } from '../../../lib/supabase-admin'
import { Button } from '../../../components/ui/button'
import { Check, CircleHelp } from 'lucide-react'
import {
  getBikeColorFallbacks,
  getBikeColorImage,
  getBikeDetailImages,
  getBikeHeroImage,
  getBikeListingImage,
  isBikeSwatchImage,
  isRenderableBikeImage,
} from '../../../lib/bike-images'

export const dynamic = 'force-dynamic'

type JsonObject = Record<string, unknown>
type SpecEntry = [string, string]

function isObject(
  value: unknown,
): value is JsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
}

function getStringArray(
  value: unknown,
): string[] {
  return asArray(value)
    .map(asString)
    .filter(Boolean)
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getSpecEntries(
  specifications: JsonObject,
): SpecEntry[] {
  return Object.entries(specifications)
    .map(
      ([key, value]) =>
        [key, asString(value)] as SpecEntry,
    )
    .filter(([, value]) => value !== '')
}

function findSpecValue(
  entries: SpecEntry[],
  aliases: string[],
): string {
  const normalizedAliases =
    aliases.map(normalizeText)

  const exact = entries.find(([key]) =>
    normalizedAliases.includes(
      normalizeText(key),
    ),
  )

  if (exact) {
    return exact[1]
  }

  const partial = entries.find(([key]) => {
    const normalizedKey = normalizeText(key)

    return normalizedAliases.some(
      (alias) =>
        normalizedKey.includes(alias) ||
        alias.includes(normalizedKey),
    )
  })

  return partial?.[1] ?? ''
}

function getHeadlineValue(value: string): string {
  if (!value) {
    return 'N/A'
  }

  const match = value.match(
    /\d+(?:[.,]\d+)?\s*(?:km\/h|km|kwh|kw|w|giờ|gio|h|phút|phut|kg|l)?/i,
  )

  return match?.[0]?.trim() || value
}

function formatPrice(price: unknown): string {
  if (
    price === null ||
    price === undefined ||
    (typeof price === 'string' && price.trim() === '')
  ) {
    return 'Liên hệ'
  }

  const numericPrice = Number(price)

  if (!Number.isFinite(numericPrice)) {
    return 'Liên hệ'
  }

  return `${new Intl.NumberFormat(
    'vi-VN',
  ).format(numericPrice)} ₫`
}

export default async function BikeDetailPage(
  props: {
    params: Promise<{ slug: string }>
  },
) {
  const params = await props.params
  const supabase = getSupabaseAdmin()

  const { data: product } = await supabase
    .from('products')
    .select('*, category:categories!inner(name)')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .eq('categories.name', 'Xe máy điện')
    .single()

  if (!product) {
    notFound()
  }

  const rawSpecifications =
    asObject(product.specifications)

  const specifications = isObject(
    rawSpecifications.specs,
  )
    ? asObject(rawSpecifications.specs)
    : rawSpecifications

  const gallery = asObject(
    rawSpecifications.gallery,
  )

  /*
   * Existing JSONB format only.
   *
   * Placement contract:
   * banner_images[0]  -> hero
   * color_details[0] -> first color
   * color_details[1] -> second color
   * exterior_images[0] -> large design image
   * exterior_images[1] -> lower-left image
   * interior_images[0] -> lower-right image
   *
   * When a dedicated gallery array is empty,
   * all_images is read in its existing order.
   */
  const bannerImages = getStringArray(
    gallery.banner_images,
  )

  const exteriorImages = getStringArray(
    gallery.exterior_images,
  )

  const interiorImages = getStringArray(
    gallery.interior_images,
  )

  const allImages = getStringArray(
    gallery.all_images,
  )

  const productImages = getStringArray(
    product.image_urls,
  )

  const listingImage = getBikeListingImage(
    product.slug,
    product.image_urls,
    '/images/vento.png',
  )

  const heroImage = getBikeHeroImage(
    product.slug,
    bannerImages,
    listingImage,
  )

  const rawColorDetails = asArray(
    rawSpecifications.color_details,
  )

  const fallbackColorDetails = getBikeColorFallbacks(
    product.slug,
  )
  const colorDetails =
    fallbackColorDetails.length > 0
      ? fallbackColorDetails
      : rawColorDetails
          .map(asObject)
          .map((item, index) => {
            const colorName =
              asString(item.color_name) || asString(item.name)
            const candidate =
              asString(item.image) || asString(item.image_url)
            const explicitSwatch = asString(item.swatch)
            const swatchUrl =
              explicitSwatch ||
              (isBikeSwatchImage(candidate) ? candidate : '')
            const exteriorImage =
              exteriorImages.length ===
                rawColorDetails.length &&
              isRenderableBikeImage(exteriorImages[index])
                ? exteriorImages[index]
                : ''

            return {
              colorName,
              imageUrl:
                exteriorImage ||
                getBikeColorImage(
                  product.slug,
                  colorName,
                  candidate,
                ),
              swatchUrl,
            }
          })

  const orderedColorDetails = colorDetails
    .filter(
      (item): item is {
        colorName: string
        imageUrl: string
        swatchUrl: string
      } => item.colorName !== '' && item.imageUrl !== null,
    )

  const bikeColors = orderedColorDetails.map((item) => ({
    name: item.colorName,
    swatch: item.swatchUrl || undefined,
  }))

  /*
   * Existing JSONB structure:
   *
   * color_details[i].image_url
   *   -> small color swatch
   *
   * gallery.exterior_images[i]
   *   -> full-bike image for the same color
   *
   * Their array indexes are paired directly. No filename
   * matching or image scoring is performed.
   */
  const colorImages = orderedColorDetails.map(
    (item) => item.imageUrl,
  )

  /*
   * Design placement comes from all_images order.
   * exterior_images is reserved for ordered color renders
   * when it has a one-to-one color mapping.
   */
  const detailImages = getBikeDetailImages(
    product.slug,
    [
      ...interiorImages,
      ...allImages,
      ...productImages,
    ],
  )

  const displayImgs = detailImages.slice(0, 2)
  const displayIntImgs = detailImages.slice(2, 3)

  const specEntries =
    getSpecEntries(specifications)

  const range = findSpecValue(specEntries, [
    'Quãng đường đi được mỗi lần sạc',
    'Quãng đường đi được 1 lần sạc',
    'Quãng đường',
    'Phạm vi hoạt động',
  ])

  const maxPower = findSpecValue(specEntries, [
    'Công suất tối đa',
    'Công suất lớn nhất',
  ])

  const maxSpeed = findSpecValue(specEntries, [
    'Tốc độ tối đa',
    'Tốc độ tối đa - SPORT',
  ])

  const chargingTime = findSpecValue(
    specEntries,
    [
      'Thời gian sạc tiêu chuẩn',
      'Thời gian sạc',
    ],
  )

  const dimensionAliases = [
    'dai x rong x cao',
    'chieu cao yen',
    'khoang sang gam',
    'trong luong',
    'tai trong',
    'the tich cop',
    'kich thuoc lop',
    'khoang cach truc banh',
  ]

  const dimensionEntries =
    specEntries.filter(([key]) => {
      const normalizedKey =
        normalizeText(key)

      return dimensionAliases.some(
        (alias) =>
          normalizedKey.includes(alias),
      )
    })

  const performanceEntries =
    specEntries.filter(([key]) => {
      const normalizedKey =
        normalizeText(key)

      return !dimensionAliases.some(
        (alias) =>
          normalizedKey.includes(alias),
      )
    })

  const technologyFeatures = [
    {
      label: 'Hệ thống khóa',
      value:
        findSpecValue(specEntries, ['Khóa xe']) ||
        'Chưa cập nhật',
      description:
        'Phương thức khóa và bảo vệ xe khi dừng đỗ.',
    },
    {
      label: 'Pin / ắc quy',
      value:
        findSpecValue(specEntries, [
          'Loại pin',
          'Loại pin/ắc quy',
          'Loại ắc quy',
        ]) || 'Chưa cập nhật',
      description:
        'Loại nguồn năng lượng ảnh hưởng đến độ bền, khối lượng và cách sạc.',
    },
    {
      label: 'Đèn pha trước',
      value:
        findSpecValue(specEntries, [
          'Đèn pha trước',
        ]) || 'Chưa cập nhật',
      description:
        'Trang bị chiếu sáng phía trước hỗ trợ quan sát khi di chuyển.',
    },
    {
      label: 'Bộ sạc',
      value:
        findSpecValue(specEntries, ['Loại sạc']) ||
        'Chưa cập nhật',
      description:
        'Công suất hoặc loại bộ sạc dùng để nạp năng lượng cho xe.',
    },
  ]

  const safetyFeatures = [
    {
      label: 'Phanh trước và sau',
      value:
        findSpecValue(specEntries, [
          'Phanh trước và sau',
        ]) || 'Chưa cập nhật',
      description:
        'Cấu hình phanh ở hai bánh, ảnh hưởng trực tiếp đến khả năng kiểm soát tốc độ.',
    },
    {
      label: 'Hệ thống giảm xóc',
      value:
        findSpecValue(specEntries, [
          'Giảm xóc trước và sau',
          'Giảm xóc',
        ]) || 'Chưa cập nhật',
      description:
        'Cấu hình giảm chấn giúp xe ổn định và êm hơn trên mặt đường không bằng phẳng.',
    },
    {
      label: 'Chuẩn chống nước động cơ',
      value:
        findSpecValue(specEntries, [
          'Tiêu chuẩn chống nước động cơ',
        ]) || 'Chưa cập nhật',
      description:
        'Mức bảo vệ động cơ trước bụi và nước trong điều kiện sử dụng phù hợp.',
    },
    {
      label: 'Lốp trước và sau',
      value:
        findSpecValue(specEntries, [
          'Kích thước lốp Trước - Sau',
        ]) || 'Chưa cập nhật',
      description:
        'Kích thước lốp ảnh hưởng đến độ bám đường và độ ổn định của xe.',
    },
  ]

  const description =
    asString(product.description) ||
    `Xe máy điện VinFast ${product.name}.`
  const depositHref = `/deposit?type=motorbike&model=${encodeURIComponent(product.name)}`
  const testDriveHref = `/test-drive?productId=${encodeURIComponent(product.id)}`

  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-brand-500 selection:text-white">
      <Header />

      {/* HERO SECTION */}
      <section className="relative flex h-screen min-h-[700px] w-full flex-col justify-between overflow-hidden bg-black">
        <img
          src={heroImage.src}
          alt={product.name}
className={`absolute inset-0 h-full w-full object-center ${
            heroImage.contain
              ? 'object-contain p-8 sm:p-16'
              : 'object-cover'
          }`}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />

        <div className="relative z-10 mt-32 flex flex-col items-center px-6 text-center sm:mt-40">
          {/* Same unobstructed hero treatment as the car page. */}
        </div>

        <div className="relative z-10 flex w-full flex-col items-center pb-12">
          <div className="mb-12 flex gap-4">
            <Link href={testDriveHref} className="flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold uppercase tracking-widest text-black shadow-xl transition-all hover:scale-105 hover:bg-white/90 active:scale-95 sm:h-14 sm:px-12 sm:text-base">
              Trải nghiệm
            </Link>

            <Link href={depositHref} className="flex h-12 items-center justify-center rounded-full border-2 border-white bg-transparent px-8 text-sm font-bold uppercase tracking-widest text-white shadow-xl backdrop-blur-sm transition-all hover:scale-105 hover:bg-white/10 active:scale-95 sm:h-14 sm:px-12 sm:text-base">
              Đặt cọc ngay
            </Link>
          </div>
        </div>
      </section>

      {/* STICKY NAV CTA */}
      <div className="sticky top-[74px] z-40 border-b border-white/10 bg-background/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6">
          <h2 className="hidden text-lg font-bold sm:block">
            {product.name}
          </h2>

          <div className="flex gap-6 text-sm font-semibold text-muted-foreground">
            <a
              href="#design"
              className="transition-colors hover:text-foreground"
            >
              Thiết kế
            </a>

            <a
              href="#performance"
              className="transition-colors hover:text-foreground"
            >
              Vận hành
            </a>

            <a
              href="#specs"
              className="transition-colors hover:text-foreground"
            >
              Thông số
            </a>
          </div>

          <div className="flex items-center gap-3">
            <span className="mr-2 hidden font-bold md:block">
              {formatPrice(
                product.displayed_price,
              )}
            </span>

            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden rounded-full border-brand-600 font-bold text-brand-600 hover:bg-brand-50 sm:inline-flex"
            >
              <Link
                href={`/cost-estimator?vehicle=${encodeURIComponent(
                  product.slug,
                )}`}
              >
                Dự toán
              </Link>
            </Button>

            <Button
              asChild
              size="sm"
              className="rounded-full bg-brand-600 font-bold text-white hover:bg-brand-700"
            >
              <Link href={depositHref}>Đặt cọc</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* HIGHLIGHTS */}
      <section
        id="performance"
        className="bg-muted py-24"
      >
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4 md:gap-12">
            {[
              [
                getHeadlineValue(range),
                'Quãng đường',
              ],
              [
                getHeadlineValue(maxPower),
                'Công suất tối đa',
              ],
              [
                getHeadlineValue(maxSpeed),
                'Tốc độ tối đa',
              ],
              [
                getHeadlineValue(chargingTime),
                'Thời gian sạc',
              ],
            ].map(([value, label]) => (
              <div
                key={label}
                className="flex flex-col items-center px-3"
              >
                <p className="mb-2 text-3xl font-bold tracking-tighter md:text-5xl">
                  {value}
                </p>

                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {orderedColorDetails.length > 0 && (
        <BikeColorSelector
          colors={bikeColors}
          images={colorImages}
        />
      )}

      {/* DESIGN SECTION */}
      <section
        id="design"
        className="bg-background py-32"
      >
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <div className="mb-16">
            <h2 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
              Thiết kế dành cho nhịp sống hiện đại
            </h2>

            <p className="max-w-2xl text-xl text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {displayImgs[0] && (
              <div className="overflow-hidden rounded-[2rem] md:col-span-2">
                <img
                  src={displayImgs[0]}
                  alt={`Thiết kế ${product.name}`}
                  className="h-auto w-full object-cover"
                />
              </div>
            )}

            {displayImgs[1] && (
              <div className="aspect-square overflow-hidden rounded-[2rem]">
                <img
                  src={displayImgs[1]}
                  alt={`Ngoại hình ${product.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {displayIntImgs[0] && (
              <div className="relative aspect-square overflow-hidden rounded-[2rem]">
                <img
                  src={displayIntImgs[0]}
                  alt={`Chi tiết ${product.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TECHNOLOGY & SAFETY */}
      <section className="bg-muted py-32">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-16 px-6 lg:grid-cols-2 lg:px-12">
          <div>
            <h2 className="mb-6 text-4xl font-bold tracking-tight">
              Công nghệ thông minh
            </h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {technologyFeatures.map(
                (feature) => {
                  const isAvailable =
                    feature.value !== 'Chưa cập nhật'

                  return (
                  <div
                    key={feature.label}
                    className={`rounded-2xl border bg-white p-6 shadow-sm ${
                      isAvailable
                        ? 'border-black/5'
                        : 'border-dashed border-slate-300'
                    }`}
                  >
                    {isAvailable ? (
                      <Check
                        className="mb-4 text-brand-500"
                        size={24}
                      />
                    ) : (
                      <CircleHelp
                        className="mb-4 text-slate-400"
                        size={24}
                      />
                    )}

                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {feature.label}
                    </p>

                    <h4 className="font-bold text-slate-900">
                      {feature.value}
                    </h4>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {isAvailable
                        ? feature.description
                        : 'VinFast chưa công bố thông tin này.'}
                    </p>
                  </div>
                  )
                },
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-6 text-4xl font-bold tracking-tight">
              Vận hành và an toàn
            </h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {safetyFeatures.map(
                (feature) => {
                  const isAvailable =
                    feature.value !== 'Chưa cập nhật'

                  return (
                  <div
                    key={feature.label}
                    className={`rounded-2xl p-6 text-white shadow-sm ${
                      isAvailable
                        ? 'bg-black'
                        : 'border border-dashed border-white/20 bg-slate-900'
                    }`}
                  >
                    {isAvailable ? (
                      <Check
                        className="mb-4 text-white"
                        size={24}
                      />
                    ) : (
                      <CircleHelp
                        className="mb-4 text-white/50"
                        size={24}
                      />
                    )}

                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                      {feature.label}
                    </p>

                    <h4 className="font-bold">
                      {feature.value}
                    </h4>

                    <p className="mt-3 text-sm leading-6 text-white/70">
                      {isAvailable
                        ? feature.description
                        : 'VinFast chưa công bố thông tin này.'}
                    </p>
                  </div>
                  )
                },
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FULL SPECS */}
      <section
        id="specs"
        className="bg-white py-32 text-foreground"
      >
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <h2 className="mb-16 text-4xl font-bold tracking-tight">
            Thông số kỹ thuật {product.name}
          </h2>

          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
            <div>
              <h3 className="mb-6 border-b border-black/10 pb-4 text-2xl font-bold">
                Động cơ & Vận hành
              </h3>

              <ul className="space-y-4">
                {performanceEntries
                  .slice(0, 14)
                  .map(([key, value]) => (
                    <li
                      key={key}
                      className="flex justify-between gap-8 border-b border-black/5 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {key}
                      </span>

                      <span className="max-w-[55%] text-right font-semibold">
                        {value}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-6 border-b border-black/10 pb-4 text-2xl font-bold">
                Kích thước & Tiện ích
              </h3>

              <ul className="space-y-4">
                {dimensionEntries.map(
                  ([key, value]) => (
                    <li
                      key={key}
                      className="flex justify-between gap-8 border-b border-black/5 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {key}
                      </span>

                      <span className="max-w-[55%] text-right font-semibold">
                        {value}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-[#171411] py-32 text-center text-white">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-8 text-4xl font-bold tracking-tight sm:text-6xl">
            Sẵn sàng trải nghiệm?
          </h2>

          <p className="mb-12 text-xl text-white/70">
            Trải nghiệm phương tiện di chuyển xanh
            cùng VinFast.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild className="h-14 rounded-full bg-white px-10 text-sm font-bold uppercase tracking-wider text-black hover:bg-white/90">
              <Link href={depositHref}>Đặt cọc ngay</Link>
            </Button>

            <Button
              variant="outline"
              className="h-14 rounded-full border-white/20 px-10 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10"
              asChild
            >
              <Link href={testDriveHref}>Đăng ký lái thử</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}


