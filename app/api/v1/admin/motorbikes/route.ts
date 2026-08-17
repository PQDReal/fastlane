import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'
import { DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX, MOTORBIKE_CATALOG_CACHE_KEY, MOTORBIKE_DETAIL_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'
import { DEFAULT_MOTORBIKE_SPEC_FIELDS, mergeVehicleSpecFields, normalizeMotorbikeSpecFields } from '@/lib/vehicle-specifications'
import {
  buildMotorbikeVersionMedia,
  findMotorbikeVersionMedia,
  MAX_MOTORBIKE_DETAIL_IMAGES,
  MAX_MOTORBIKE_VERSION_DETAIL_IMAGES,
  normalizeMotorbikeDetailImages,
} from '@/lib/motorbike-version-media'
import { resolveMotorbikeVariantColorMedia, type MotorbikeVariantColorMedia } from '@/lib/motorbike-variant-color-media'
import { allocateVehicleVariantSkus } from '@/lib/vehicle-sku'

function handleAuthorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function makeUrlsAbsolute(obj: any, origin: string): any {
  if (typeof obj === 'string') {
    if (obj.startsWith('/uploads')) {
      return `${origin}${obj}`
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(item => makeUrlsAbsolute(item, origin))
  }
  if (obj && typeof obj === 'object') {
    const res: any = {}
    for (const key of Object.keys(obj)) {
      res[key] = makeUrlsAbsolute(obj[key], origin)
    }
    return res
  }
  return obj
}

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Nội dung JSON không hợp lệ.' }, { status: 400 })
  }

  // Prepend origin to relative upload URLs to satisfy database URL check constraints
  const requestUrl = new URL(request.url)
  const host = request.headers.get('host') || requestUrl.host
  const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol.startsWith('https') ? 'https' : 'http')
  const origin = `${proto}://${host}`
  
  body = makeUrlsAbsolute(body, origin)

  const {
    name,
    slug,
    description,
    listing_image_url,
    hero_image_url,
    detail_image_urls: rawDetailImageUrls = [],
    specifications = {},
    specification_fields = undefined,
    colors = [],
    advanced_color_price = 0,
    versions = [],
    landing_page_blocks = [],
  } = body
  const isActive = body.is_active === true
  const detail_image_urls = normalizeMotorbikeDetailImages(rawDetailImageUrls)

  // Basic validation
  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Tên xe và slug không được để trống.' }, { status: 400 })
  }
  if (!listing_image_url || !hero_image_url) {
    return NextResponse.json({ error: 'Hình ảnh thumbnail và hình landing page không được để trống.' }, { status: 400 })
  }
  if (colors.length === 0) {
    return NextResponse.json({ error: 'Vui lòng thêm ít nhất một màu sắc.' }, { status: 400 })
  }
  if (versions.length === 0) {
    return NextResponse.json({ error: 'Vui lòng thêm ít nhất một phiên bản.' }, { status: 400 })
  }
  if (Array.isArray(rawDetailImageUrls) && rawDetailImageUrls.length > MAX_MOTORBIKE_DETAIL_IMAGES) {
    return NextResponse.json({ error: `Thư viện ảnh chi tiết chỉ được có tối đa ${MAX_MOTORBIKE_DETAIL_IMAGES} ảnh.` }, { status: 400 })
  }
  const normalizedColorNames = colors.map((color: any) => String(color.color_name ?? '').trim().toLocaleLowerCase('vi'))
  if (normalizedColorNames.some((colorName: string) => !colorName) || new Set(normalizedColorNames).size !== normalizedColorNames.length) {
    return NextResponse.json({ error: 'Tên màu không được để trống hoặc trùng nhau.' }, { status: 400 })
  }
  if (colors.some((color: any) => !String(color.swatch ?? '').trim())) {
    return NextResponse.json({ error: 'Mỗi màu phải có một swatch dùng chung.' }, { status: 400 })
  }
  const normalizedVersionNames = versions.map((version: any) => String(version.name ?? '').trim().toLocaleLowerCase('vi'))
  const normalizedVersionSkus = versions.map((version: any) => String(version.sku ?? '').trim().toLocaleLowerCase())
  if (normalizedVersionNames.some((versionName: string) => !versionName)
    || normalizedVersionSkus.some((sku: string) => !sku)
    || new Set(normalizedVersionNames).size !== normalizedVersionNames.length
    || new Set(normalizedVersionSkus).size !== normalizedVersionSkus.length) {
    return NextResponse.json({ error: 'Tên phiên bản và SKU gốc không được để trống hoặc trùng nhau.' }, { status: 400 })
  }
  if (versions.some((version: any) => Array.isArray(version.detail_image_urls) && version.detail_image_urls.length > MAX_MOTORBIKE_VERSION_DETAIL_IMAGES)) {
    return NextResponse.json({ error: `Mỗi phiên bản chỉ được có tối đa ${MAX_MOTORBIKE_VERSION_DETAIL_IMAGES} ảnh chi tiết.` }, { status: 400 })
  }
  if (versions.some((version: any) => Object.values(version.stock_by_color ?? {}).some((value) => !Number.isInteger(Number(value)) || Number(value) < 0))) {
    return NextResponse.json({ error: 'Tồn kho của từng phiên bản và màu phải là số nguyên không âm.' }, { status: 400 })
  }

  const colorNames = new Set(colors.map((color: any) => String(color.color_name)))
  const advancedColorPrice = Math.max(0, Number(advanced_color_price) || 0)
  const priceForConfiguration = (version: any, color: any) =>
    Number(version.price) + (color.color_type === 'ADVANCED' ? advancedColorPrice : 0)
  const sellableConfigurations = versions.flatMap((version: any, versionIndex: number) => {
    const selectedColors = Array.isArray(version.compatible_colors)
      ? Array.from(new Set(version.compatible_colors.map(String)))
      : colors.map((color: any) => String(color.color_name))
    return selectedColors.flatMap((colorName: string) => {
      if (!colorNames.has(colorName)) return []
      const colorIndex = colors.findIndex((color: any) => color.color_name === colorName)
      return [{ version, versionIndex, color: colors[colorIndex], colorIndex }]
    })
  })
  const configurationSignatures = sellableConfigurations.map(({ version, color }: any) => `${version.sku}\u001f${color.color_name}`)
  if (sellableConfigurations.length === 0 || new Set(configurationSignatures).size !== configurationSignatures.length) {
    return NextResponse.json({ error: 'Các cặp phiên bản và màu phải hợp lệ, không trùng nhau.' }, { status: 400 })
  }
  if (sellableConfigurations.some(({ version, color }: any) => !Number.isFinite(priceForConfiguration(version, color)) || priceForConfiguration(version, color) <= 0)) {
    return NextResponse.json({ error: 'Giá bán của từng phiên bản phải lớn hơn 0.' }, { status: 400 })
  }
  const colorMediaForConfigurations: MotorbikeVariantColorMedia[] = sellableConfigurations.map(({ version, color }: any) => (
    resolveMotorbikeVariantColorMedia(version, color)
  ))
  if (colorMediaForConfigurations.some((media) => !media.swatch)) {
    return NextResponse.json({ error: 'Mỗi tổ hợp phiên bản và màu phải có swatch dùng chung.' }, { status: 400 })
  }
  const versionMedia = buildMotorbikeVersionMedia(versions)

  const productId = randomUUID()
  const categoryId = '6dfde2e5-b9d5-755c-10db-19a7ce6c24b5' // Xe máy điện category ID

  // Format price string for specifications
  const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
  const priceStr = versions.map((v: any) => `${v.name}: ${priceFormatter.format(v.price)}`).join(' / ')

  const image_urls = Array.from(new Set([
    listing_image_url,
    hero_image_url,
    ...colorMediaForConfigurations.flatMap((media) => [media.image_url, media.swatch]),
    ...versionMedia.flatMap((media) => [media.image_url, ...media.detail_image_urls]),
    ...detail_image_urls,
  ].filter(Boolean)))

  // Format specifications JSON
  const formattedSpecs = {
    url: `https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-${slug}`,
    name,
    price: priceStr,
    specs: specifications,
    specification_fields: mergeVehicleSpecFields(
      normalizeMotorbikeSpecFields(specification_fields),
      specifications,
      'Kích thước & Tiện ích',
      DEFAULT_MOTORBIKE_SPEC_FIELDS,
    ),
    colors: colors.map((c: any) => c.color_name),
    images: image_urls,
    status: 'Đang kinh doanh',
    deposit: `${new Intl.NumberFormat('vi-VN').format(versions[0]?.deposit_amount || 2000000)} VNĐ`,
    gallery: {
      all_images: image_urls,
      tech_images: [],
      banner_images: [hero_image_url],
      exterior_images: [],
      interior_images: [],
    },
    variants: versions.map((v: any) => v.name),
    version_media: versionMedia,
    variant_compatibility: sellableConfigurations.map(({ version, color }: any, rowIndex: number) => ({
      version: version.name,
      exterior_color: color.color_name,
      image_url: colorMediaForConfigurations[rowIndex].image_url,
      swatch: colorMediaForConfigurations[rowIndex].swatch,
    })),
    product_type: 'motorbike',
    color_details: colors.map((c: any) => {
      const configurationIndex = sellableConfigurations.findIndex(({ color }: any) => color.color_name === c.color_name)
      const fallbackMedia = configurationIndex >= 0 ? colorMediaForConfigurations[configurationIndex] : { image_url: '', swatch: '' }
      return {
        swatch: String(c.swatch ?? '').trim() || fallbackMedia.swatch,
        image_url: fallbackMedia.image_url,
        color_name: c.color_name,
        color_type: c.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
        price_adjustment: c.color_type === 'ADVANCED' ? advancedColorPrice : 0,
      }
    }),
    detail_images: detail_image_urls,
    representative_image: hero_image_url,
    landing_page_blocks,
  }

  const displayedPrice = Math.min(...sellableConfigurations.map(({ version, color }: any) => priceForConfiguration(version, color)))

  const supabase = getSupabaseAdmin()
  let allocatedSkus: string[]
  try {
    allocatedSkus = await allocateVehicleVariantSkus(supabase, 'BIKE', sellableConfigurations.length)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể cấp SKU xe máy điện.' }, { status: 500 })
  }

  // 1. Insert into products
  const { error: productError } = await supabase
    .from('products')
    .insert({
      id: productId,
      category_id: categoryId,
      name,
      slug,
      description,
      product_type: 'BIKE',
      is_active: isActive,
      specifications: formattedSpecs,
      image_urls,
      displayed_price: displayedPrice,
      advanced_color_price: advancedColorPrice,
    })

  if (productError) {
    return NextResponse.json({ error: `Lỗi tạo sản phẩm: ${productError.message}` }, { status: 500 })
  }

  // 2. Insert into product_variants
  // Inventory is tracked per sellable version + colour combination. Do not
  // create one shared product variant for every colour, otherwise setting one
  // colour to zero would incorrectly hide all colours of that model.
  const productVariantRows = sellableConfigurations.map(({ version, color: colorItem }: any, rowIndex: number) => ({
      id: randomUUID(),
      product_id: productId,
      sku: allocatedSkus[rowIndex],
      name: `${version.name} - ${colorItem.color_name}`,
      original_price: priceForConfiguration(version, colorItem),
      sale_price: null,
      is_active: isActive,
      option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}&color=${String(colorItem.color_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      metadata: {
        source: 'admin_motorbike_creation',
        base_sku: version.sku,
        version: version.name,
        color: colorItem.color_name,
        color_image_url: colorMediaForConfigurations[rowIndex].image_url,
        color_swatch_url: colorMediaForConfigurations[rowIndex].swatch,
        version_image_url: findMotorbikeVersionMedia(versionMedia, version)?.image_url || null,
        version_detail_image_urls: findMotorbikeVersionMedia(versionMedia, version)?.detail_image_urls || [],
      },
      deposit_amount: version.deposit_amount,
    }))

  const { error: variantError } = await supabase
    .from('product_variants')
    .insert(productVariantRows)

  if (variantError) {
    // Attempt rollback of product
    await supabase.from('products').delete().eq('id', productId)
    return NextResponse.json({ error: `Lỗi tạo phiên bản sản phẩm: ${variantError.message}` }, { status: 500 })
  }

  // 3. Insert into vehicle_variants (versions * colors combinations)
  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, rowIndex: number) => {
    const { versionIndex, colorIndex, version: origVersion, color: colorItem } = sellableConfigurations[rowIndex]
      const variantId = randomUUID()
      const catalogSpecs = {
        ...formattedSpecs,
        catalog: {
          source: 'products/product_variants',
          sale_price: null,
          color_order: colorIndex + 1,
          color_type: colorItem.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
          color_price_adjustment: colorItem.color_type === 'ADVANCED' ? advancedColorPrice : 0,
          variant_color_image_url: colorMediaForConfigurations[rowIndex].image_url,
          variant_color_swatch_url: colorMediaForConfigurations[rowIndex].swatch,
          description,
          migrated_at: generatedAt,
          product_slug: slug,
          version_order: versionIndex + 1,
          version_sku: origVersion.sku,
          hero_image_url,
          version_image_url: findMotorbikeVersionMedia(versionMedia, origVersion)?.image_url || '',
          original_price: Number(variantRow.original_price),
          detail_image_urls: detail_image_urls,
          version_detail_image_urls: findMotorbikeVersionMedia(versionMedia, origVersion)?.detail_image_urls || [],
          listing_image_url,
        },
      }

      vehicleVariantRows.push({
        id: variantId,
        product_id: productId,
        product_type: 'BIKE',
        product_name: name,
        deposit_amount: variantRow.deposit_amount,
        specs: catalogSpecs,
        variant_name: `${name} ${origVersion.name} - ${colorItem.color_name}`,
        sku: variantRow.sku,
        price: variantRow.original_price,
        color: colorItem.color_name,
        color_type: colorItem.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
        color_price_adjustment: colorItem.color_type === 'ADVANCED' ? advancedColorPrice : 0,
        image_car_url: colorMediaForConfigurations[rowIndex].image_url,
        image_color_url: colorMediaForConfigurations[rowIndex].swatch,
        version: origVersion.name,
        is_active: isActive,
        product_variant_id: variantRow.id,
      })
  })

  const { error: vehicleVariantError } = await supabase
    .from('vehicle_variants')
    .insert(vehicleVariantRows)

  if (vehicleVariantError) {
    // Attempt rollback
    await supabase.from('product_variants').delete().eq('product_id', productId)
    await supabase.from('products').delete().eq('id', productId)
    return NextResponse.json({ error: `Lỗi tạo cấu hình xe: ${vehicleVariantError.message}` }, { status: 500 })
  }

  const { error: inventoryError } = await supabase
    .from('inventory_items')
  .insert(productVariantRows.map((variantRow: any, rowIndex: number) => {
    const { version, color } = sellableConfigurations[rowIndex]
    return {
      variant_id: variantRow.id,
      on_hand_quantity: Number(version?.stock_by_color?.[color?.color_name] ?? 0),
    }
  }))
  if (inventoryError) {
    await supabase.from('vehicle_variants').delete().eq('product_id', productId)
    await supabase.from('product_variants').delete().eq('product_id', productId)
    await supabase.from('products').delete().eq('id', productId)
    return NextResponse.json({ error: `Lỗi tạo tồn kho: ${inventoryError.message}` }, { status: 500 })
  }

  revalidateTag('motorbike-catalog')
  await Promise.all([
    deleteRedisKey(MOTORBIKE_CATALOG_CACHE_KEY),
    deleteRedisKeysByPrefix(MOTORBIKE_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({
    success: true,
    productId,
    slug,
  }, { status: 201 })
}
