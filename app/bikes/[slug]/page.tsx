import { notFound } from 'next/navigation'
import { Header } from '../../../components/header'
import { Footer } from '../../../components/footer'
import Link from 'next/link'
import { BikeVersionMediaGallery } from '../../../components/bike-version-media-gallery'
import { getMotorbikeCatalogBySlug } from '../../../lib/motorbike-catalog'
import { getSupabaseAdmin } from '../../../lib/supabase-admin'
import { findMotorbikeVersionMedia, normalizeMotorbikeVersionMedia } from '../../../lib/motorbike-version-media'
import { Button } from '../../../components/ui/button'
import {
  BatteryCharging,
  Calculator,
  Check,
  Clock,
  CircleHelp,
  FileDown,
  Gauge,
  Zap,
} from 'lucide-react'
import { BikeShareButton } from './bike-detail-actions'
import LandingPageRenderer from '../../../components/landing-page-renderer'
import Image from 'next/image'

// Avoid querying Supabase while the deployment build is prerendering pages.
export const revalidate = 300

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

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
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
  const motorbike = await getMotorbikeCatalogBySlug(params.slug)

  if (!motorbike) {
    notFound()
  }

  const { data: mediaProduct } = await getSupabaseAdmin()
    .from('products')
    .select('specifications')
    .eq('id', motorbike.productId)
    .maybeSingle()
  const storedVersionMedia = normalizeMotorbikeVersionMedia(
    asObject(mediaProduct?.specifications).version_media,
  )

  const product = {
    id: motorbike.productId,
    name: motorbike.name,
    slug: motorbike.slug,
    description: motorbike.description,
    displayed_price: motorbike.displayedPrice,
  }
  const rawSpecifications = motorbike.specifications
  const visibleSpecificationFields = motorbike.specificationFields.filter((field) => field.visible !== false)
  const specificationLabels = new Map(visibleSpecificationFields.map((field) => [field.key, field.label]))
  const specifications = Object.fromEntries(
    visibleSpecificationFields
      .map((field) => [field.key, motorbike.specifications[field.key] ?? ''])
      .filter(([, value]) => asString(value) !== ''),
  )
  const listingImage = motorbike.listingImageUrl
  const heroImage = {
    src: motorbike.heroImageUrl,
    contain: motorbike.heroImageUrl === motorbike.listingImageUrl,
  }
  const detailImages = motorbike.detailImageUrls
  const versionMediaOptions = motorbike.versions.map((version) => {
    const media = findMotorbikeVersionMedia(storedVersionMedia, version)
    return {
      name: version.name,
      sku: version.sku,
      price: version.price,
      imageUrl: media?.image_url || '',
      detailImageUrls: media?.detail_image_urls || [],
    }
  })
  const versionColorOptions = motorbike.variantRows.map((variant) => {
    const version = motorbike.versions.find((entry) => entry.name === variant.version)
    return {
      versionName: variant.version,
      versionSku: version?.sku || variant.sku,
      colorName: variant.color,
      imageUrl: variant.imageCarUrl,
      swatchUrl: variant.imageColorUrl,
    }
  })

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

  const specificationSections = new Map(
    visibleSpecificationFields.map((field) => [field.key, normalizeText(field.section)]),
  )
  const headlineSpecificationKeys = new Set([
    'Quãng đường đi được mỗi lần sạc',
    'Công suất tối đa',
    'Tốc độ tối đa',
    'Thời gian sạc tiêu chuẩn',
  ])
  const dimensionEntries = specEntries.filter(([key]) => {
    if (headlineSpecificationKeys.has(key)) return false
    const section = specificationSections.get(key) ?? ''
    return section.includes('kich thuoc') || section.includes('tien ich')
  })
  const performanceEntries = specEntries.filter(([key]) => (
    !headlineSpecificationKeys.has(key) &&
    !dimensionEntries.some(([entryKey]) => entryKey === key)
  ))

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
  const brochureUrl = [
    motorbike.brochureUrl,
  ]
    .map(asString)
    .find(
      (value) =>
        /^(?:https?:\/\/|\/)/i.test(value) &&
        /\.pdf(?:[?#].*)?$/i.test(value),
    ) ?? ''
  const productDetailHref = `/bikes/${encodeURIComponent(product.slug)}`
  const depositHref = `/deposit?type=motorbike&model=${encodeURIComponent(product.name)}&returnTo=${encodeURIComponent(productDetailHref)}`
  const testDriveHref = `/test-drive?productId=${encodeURIComponent(product.id)}`
  const estimatorHref = `/cost-estimator?vehicle=${encodeURIComponent(product.slug)}`

  const blocks = (rawSpecifications as any)?.landing_page_blocks || null
  const hasCustomBlocks = Array.isArray(blocks) && blocks.length > 0

  return (
    <main className="flex min-h-screen flex-col bg-background pb-24 selection:bg-brand-500 selection:text-white md:pb-0">
      <Header />

      {/* HERO SECTION */}
      <section className="relative flex h-screen min-h-[700px] w-full flex-col justify-between overflow-hidden bg-black">
        <Image
          src={heroImage.src}
          alt={product.name}
          fill
          priority
          sizes="100vw"
          className={`absolute inset-0 h-full w-full object-center ${
            heroImage.contain
              ? 'object-contain p-8 sm:p-16'
              : 'object-cover'
          }`}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />

        <div className="absolute right-5 top-28 z-20 sm:right-8 sm:top-32">
          <BikeShareButton productName={product.name} />
        </div>

        <div className="relative z-10 mt-28 flex flex-col items-center px-6 text-center sm:mt-36">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-white/70">
            Xe máy điện
          </p>
          <h1 className="text-5xl font-black uppercase tracking-[-0.05em] text-white drop-shadow-2xl sm:text-7xl lg:text-8xl">
            {product.name}
          </h1>
          <p className="mt-4 rounded-full border border-white/20 bg-black/20 px-5 py-2 text-sm font-semibold text-white/90 backdrop-blur-sm">
            Giá từ {formatPrice(product.displayed_price)}
          </p>
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
          <a
            href="#performance"
            className="flex flex-col items-center text-white/65 transition-colors hover:text-white"
            aria-label="Khám phá thông tin xe"
          >
            <span className="mb-7 text-[10px] font-bold uppercase tracking-[0.3em] sm:text-xs">
              Khám phá
            </span>
            <span className="scroll-line relative h-10 w-px overflow-hidden bg-white/35 sm:h-16">
              <span className="scroll-line-pulse absolute left-0 top-0 h-8 w-px bg-white" />
            </span>
          </a>
        </div>
      </section>

      {/* STICKY NAV CTA */}
      <div className="sticky top-[74px] z-40 border-b border-white/10 bg-background/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <h2 className="hidden text-lg font-bold sm:block">
            {product.name}
          </h2>

          <nav
            aria-label="Điều hướng nội dung xe"
            className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap text-xs font-semibold text-muted-foreground [scrollbar-width:none] sm:justify-center sm:gap-6 sm:text-sm [&::-webkit-scrollbar]:hidden"
          >
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
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
                href={estimatorHref}
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

      {hasCustomBlocks ? (
        <LandingPageRenderer blocks={blocks} />
      ) : (
        <>
          {/* HIGHLIGHTS */}
          <section id="performance" className="border-y border-slate-100 bg-white py-16">
            <div className="mx-auto max-w-6xl px-6">
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Quãng đường', value: range || 'N/A', icon: BatteryCharging },
                  { label: 'Công suất tối đa', value: maxPower || 'N/A', icon: Zap },
                  { label: 'Tốc độ tối đa', value: maxSpeed || 'N/A', icon: Gauge },
                  { label: 'Thời gian sạc', value: chargingTime || 'N/A', icon: Clock },
                ].map((stat) => {
                  const Icon = stat.icon
                  return (
                    <div key={stat.label} className="flex min-h-[236px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
                      <Icon className="mb-5 h-9 w-9 text-brand-500" strokeWidth={2} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{stat.label}</span>
                      <span className="mt-4 max-w-[240px] text-2xl font-bold leading-tight text-slate-950">{stat.value}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

      {/* CUSTOMER UTILITIES */}
      <section className="border-b border-black/5 bg-background py-14 sm:py-16">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-700">
                Tiện ích cho bạn
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Chọn bước tiếp theo
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Xem trước chi phí và chính sách sử dụng để chọn phương án phù hợp với nhu cầu di chuyển.
            </p>
          </div>

          <div
            className={`grid gap-4 ${
              brochureUrl
                ? 'md:grid-cols-3'
                : 'md:grid-cols-2'
            }`}
          >
            <Link
              href={estimatorHref}
              className="group flex min-h-40 flex-col justify-between rounded-2xl border border-black/10 bg-muted/40 p-6 transition-all hover:-translate-y-1 hover:border-brand-500/40 hover:bg-brand-50 hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Calculator
                size={24}
                className="text-brand-700"
              />
              <div className="mt-8">
                <h3 className="font-bold">
                  Dự toán chi phí
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Ước tính giá xe, chi phí đăng ký và phương án trả góp.
                </p>
              </div>
            </Link>

            <a
              href="https://vinfastauto.com/vn_vi/dich-vu-pin-xe-may-dien"
              target="_blank"
              rel="noreferrer"
              className="group flex min-h-40 flex-col justify-between rounded-2xl border border-black/10 bg-muted/40 p-6 transition-all hover:-translate-y-1 hover:border-brand-500/40 hover:bg-brand-50 hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <BatteryCharging
                size={24}
                className="text-brand-700"
              />
              <div className="mt-8">
                <h3 className="font-bold">
                  Chính sách pin
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Tham khảo hình thức sử dụng pin và các chi phí liên quan.
                </p>
              </div>
            </a>

            {brochureUrl && (
              <a
                href={brochureUrl}
                target="_blank"
                rel="noreferrer"
                className="group flex min-h-40 flex-col justify-between rounded-2xl border border-black/10 bg-muted/40 p-6 transition-all hover:-translate-y-1 hover:border-brand-500/40 hover:bg-brand-50 hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <FileDown
                  size={24}
                  className="text-brand-700"
                />
                <div className="mt-8">
                  <h3 className="font-bold">
                    Tải brochure
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Xem tài liệu giới thiệu và thông tin chính thức của mẫu xe.
                  </p>
                </div>
              </a>
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
        </>
      )}

      <BikeVersionMediaGallery
        productName={product.name}
        versions={versionMediaOptions}
        colorVariants={versionColorOptions}
        description={description}
        fallbackImageUrl={heroImage.src}
        fallbackDetailImageUrls={detailImages}
      />

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
                {performanceEntries.map(([key, value]) => (
                  <li
                    key={key}
                    className="flex justify-between gap-8 border-b border-black/5 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {specificationLabels.get(key) || key}
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
                        {specificationLabels.get(key) || key}
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

      {/* MOBILE PURCHASE ACTIONS */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 px-3 pt-3 shadow-[0_-12px_36px_rgba(0,0,0,0.12)] backdrop-blur-xl pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
          <Link
            href={testDriveHref}
            className="flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100 active:scale-[0.98]"
          >
            Trải nghiệm
          </Link>
          <Link
            href={depositHref}
            className="flex h-12 items-center justify-center rounded-full bg-brand-600 px-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-700 active:scale-[0.98]"
          >
            Đặt cọc
          </Link>
        </div>
      </div>

      <Footer />
    </main>
  )
}


