import { NextResponse } from 'next/server'
import { mergeVehicleSpecFields, normalizeVehicleSpecFields } from '@/lib/vehicle-specifications'
import { revalidateTag } from 'next/cache'
import path from 'path'
import fs from 'fs'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKeysByPrefix } from '@/lib/redis'
import { CAR_CATALOG_CACHE_PREFIX, CAR_DETAIL_CACHE_PREFIX, DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'
import { reconstructCarAdminConfiguration } from '@/lib/car-admin-variants'
import { normalizeCarSkuBase } from '@/lib/car-sku'
import { allocateVehicleVariantSkus, vehicleConfigurationKey } from '@/lib/vehicle-sku'

type Context = { params: Promise<{ productId: string }> }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function GET(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  const { productId } = await context.params
  if (!UUID_PATTERN.test(productId)) {
    return NextResponse.json({ error: 'Mã sản phẩm không hợp lệ.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Load product
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('product_type', 'CAR')
    .maybeSingle()

  if (productError) {
    return NextResponse.json({ error: `Lỗi tải sản phẩm: ${productError.message}` }, { status: 500 })
  }
  if (!product) {
    return NextResponse.json({ error: 'Không tìm thấy sản phẩm xe ô tô.' }, { status: 404 })
  }

  // Load product variants
  const { data: productVariants, error: pvError } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)

  if (pvError) {
    return NextResponse.json({ error: `Lỗi tải phiên bản sản phẩm: ${pvError.message}` }, { status: 500 })
  }

  const variantIds = (productVariants || []).map((variant: any) => variant.id)
  const { data: inventoryItems, error: inventoryError } = variantIds.length > 0
    ? await supabase.from('inventory_items').select('variant_id, on_hand_quantity').in('variant_id', variantIds)
    : { data: [], error: null }
  if (inventoryError) {
    return NextResponse.json({ error: `Lỗi tải tồn kho: ${inventoryError.message}` }, { status: 500 })
  }
  const inventoryByVariantId = new Map(
    (inventoryItems || []).map((item: any) => [item.variant_id, Number(item.on_hand_quantity)]),
  )

  const { data: vehicleVariants, error: vvError } = await supabase
    .from('vehicle_variants')
    .select('product_variant_id,version,color,sku,price,deposit_amount,specs,interior_color,color_type,color_price_adjustment,image_car_url,image_color_url,is_active')
    .eq('product_id', productId)

  if (vvError) {
    return NextResponse.json({ error: `Lỗi tải cấu hình xe: ${vvError.message}` }, { status: 500 })
  }

  const specsObj = product.specifications || {}
  const image_urls = product.image_urls || []

  let colors = (specsObj.fallback_colors || []).map((c: any) => ({
    color_name: c.name,
    image_url: c.image,
    swatch: c.swatch,
    color_type: c.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
  }))

  let interiors = (specsObj.interiors || []).map((i: any) => ({
    interior_name: i.name,
    image_url: i.image,
    swatch: i.swatch,
    image_urls: i.image_urls || (i.image ? [i.image] : []),
    allowed_combinations: i.allowed_combinations || []
  }))

  // Load cars.json to resolve fallbacks
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  let carRichData: any = {}
  try {
    if (fs.existsSync(carsDataPath)) {
      const carsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
      carRichData = carsData.find((c: any) => c.name === product.name) ||
                    carsData.find((c: any) => product.name.includes(c.name) || c.name.includes(product.name)) ||
                    carsData[0]
    }
  } catch (err) {
    console.error('Lỗi đọc cars.json trong API route:', err)
  }

  // Cars seeded before the colour-tier model store their surcharge as
  // `price_delta` in cars.json. Preserve that information when opening the
  // Admin editor instead of silently converting all legacy colours to standard.
  const richColorByName = new Map<string, any>(
    (Array.isArray(carRichData?.colors) ? carRichData.colors : [])
      .filter((color: any) => color?.name)
      .map((color: any) => [String(color.name), color]),
  )
  colors = colors.map((color: any) => {
    const legacySurcharge = Number(richColorByName.get(String(color.color_name))?.price_delta ?? 0)
    return {
      ...color,
      color_type: color.color_type === 'ADVANCED' || legacySurcharge > 0 ? 'ADVANCED' : 'STANDARD',
    }
  })

  // vehicle_variants is the canonical deposit/catalog source. Project its
  // colour metadata into the admin editor so the dashboard and deposit page
  // cannot disagree about tiers or available colours.
  const canonicalColors = new Map<string, any>()
  for (const color of colors) {
    if (color.color_name) {
      canonicalColors.set(String(color.color_name), {
        ...color,
        images_by_version: {}
      })
    }
  }

  for (const row of vehicleVariants ?? []) {
    if (!row.color || row.is_active === false) continue
    const colorKey = String(row.color)
    if (!canonicalColors.has(colorKey)) {
      canonicalColors.set(colorKey, {
        color_name: row.color,
        image_url: row.image_car_url || '',
        swatch: row.image_color_url || '',
        color_type: row.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
        price_adjustment: Number(row.color_price_adjustment || 0),
        images_by_version: {}
      })
    }
    if (row.version && row.image_car_url) {
      const colorData = canonicalColors.get(colorKey)
      colorData.images_by_version[row.version] = row.image_car_url
    }
  }
  if (canonicalColors.size > 0) colors = Array.from(canonicalColors.values())

  const isVehicleImage = (url: string | null | undefined): boolean => {
    if (!url) return false
    const lower = url.toLowerCase()
    if (lower.endsWith('.svg') || lower.endsWith('.mp4')) return false
    
    const excludeKeywords = [
      'logo', 'separate-line', 'line', 'icon', 'tvc', 'banner', 'charging', 'station',
      'compare', 'support', 'urgent', 'vip', 'gia', 'price', 'table', 'spec', 'mb.webp',
      'hero-mb', 'canvas', 'tag-line', 'naturel', 'interior-first-sight', 'video'
    ]
    
    for (const kw of excludeKeywords) {
      if (lower.includes(kw)) return false
    }
    if (lower.endsWith('/vf3.jpg')) return false
    return true
  }

  const isWhiteColor = (name: string | null | undefined): boolean => {
    if (!name) return false
    const lower = name.toLowerCase()
    return lower.includes('trắng') || 
           lower.includes('white') || 
           lower.includes('blanc') || 
           lower.includes('brahminy') || 
           lower.includes('infinity')
  }

  let listing_image_url = ''
  if (specsObj.color_details?.length > 0) {
    const whiteCol = specsObj.color_details.find((c: any) => c.image_url && isWhiteColor(c.color_name) && isVehicleImage(c.image_url))
    listing_image_url = whiteCol?.image_url || specsObj.color_details.find((c: any) => c.image_url && isVehicleImage(c.image_url))?.image_url || ''
  }
  if (!listing_image_url && specsObj.fallback_colors?.length > 0) {
    const whiteCol = specsObj.fallback_colors.find((c: any) => c.image && isWhiteColor(c.name) && isVehicleImage(c.image))
    listing_image_url = whiteCol?.image || specsObj.fallback_colors.find((c: any) => c.image && isVehicleImage(c.image))?.image || ''
  }
  if (!listing_image_url && specsObj.representative_image && isVehicleImage(specsObj.representative_image)) {
    listing_image_url = specsObj.representative_image
  }
  if (!listing_image_url && specsObj.gallery?.exterior_images?.length > 0) {
    const whiteImg = specsObj.gallery.exterior_images.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
    listing_image_url = whiteImg || specsObj.gallery.exterior_images.find((img: string) => isVehicleImage(img)) || ''
  }
  if (!listing_image_url && specsObj.gallery?.all_images?.length > 0) {
    const whiteImg = specsObj.gallery.all_images.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
    listing_image_url = whiteImg || specsObj.gallery.all_images.find((img: string) => isVehicleImage(img)) || ''
  }
  if (!listing_image_url) {
    const whiteImg = image_urls.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
    listing_image_url = whiteImg || image_urls.find((img: string) => isVehicleImage(img)) || image_urls[0] || ''
  }

  let hero_image_url = specsObj.gallery?.banner_images?.find((img: string) => !img.toLowerCase().includes('mobile') && !img.toLowerCase().includes('_mb'))
    || specsObj.gallery?.banner_images?.[0]
    || image_urls[1]
    || carRichData?.gallery?.banner_images?.find((img: string) => !img.toLowerCase().includes('mobile') && !img.toLowerCase().includes('_mb'))
    || carRichData?.gallery?.banner_images?.[0]
    || image_urls[0]
    || '/images/vf8.png'

  if (product.name === 'VF 3') {
    hero_image_url = carRichData?.gallery?.exterior_images?.[1] || hero_image_url
  } else if (product.slug === 'vf-8-all-new' || product.name.toLowerCase().includes('vf 8 the all')) {
    hero_image_url = 'https://vinfastauto.com/themes/porto/img/vf8-new-product/hero-banner.svg'
  } else if (product.name.includes('MPV')) {
    hero_image_url = 'https://static-cms-prod.vinfastauto.com/pdp/vf_mpv_7/M_01.webp'
  }

  const raw_detail_images = specsObj.gallery?.detail_images || specsObj.gallery_images || []

  // Filter out listing, hero, color, and interior images from the details gallery to prevent duplication
  const colorUrls = new Set(colors.flatMap((c: any) => [c.image_url, c.swatch].filter(Boolean)))
  const interiorUrls = new Set(interiors.flatMap((i: any) => [i.image_url, i.swatch].filter(Boolean)))
  const basicUrls = new Set([listing_image_url, hero_image_url].filter(Boolean))

  const detail_image_urls = raw_detail_images.filter((url: string) => {
    if (!url) return false
    if (basicUrls.has(url)) return false
    if (colorUrls.has(url)) return false
    if (interiorUrls.has(url)) return false
    return true
  })

  // Extract flat specifications
  const firstVersionName = Object.keys(specsObj.specs || {})[0]
  const versionSpecs = firstVersionName ? specsObj.specs[firstVersionName]?.specs : null

  const reconstructedSpecifications = {
    'Quãng đường đi được': versionSpecs?.powertrain?.distance || '',
    'Công suất tối đa': versionSpecs?.powertrain?.maxPower || '',
    'Mô-men xoắn cực đại': versionSpecs?.powertrain?.maxTorque || '',
    'Tốc độ tối đa': versionSpecs?.powertrain?.topSpeed || '',
    'Hệ dẫn động': versionSpecs?.powertrain?.drivetrain || '',
    'Dung lượng pin': versionSpecs?.powertrain?.batteryCapacity || '',
    'Thời gian sạc nhanh': versionSpecs?.powertrain?.fastChargingTime || '',
    'Công suất sạc DC tối đa': versionSpecs?.powertrain?.maxDCCharging || '',
    'Dài x Rộng x Cao': versionSpecs?.dimension?.length || '',
    'Chiều dài cơ sở': versionSpecs?.dimension?.wheelbase || '',
    'Khoảng sáng gầm xe': versionSpecs?.dimension?.croundClearance || '',
    'Khối lượng / Tải trọng': versionSpecs?.dimension?.kurbWeightPayload || '',
    'Số chỗ ngồi': versionSpecs?.interior?.numberOfSeats || '',
    'Đèn chiếu sáng phía trước': versionSpecs?.exterior?.auto || '',
    'Kích thước la-zăng': versionSpecs?.exterior?.lazang || '',
    'Hệ thống giải trí': versionSpecs?.interior?.informationCenter || '',
    'Hệ thống điều hòa': versionSpecs?.interior?.airConditioner || '',
    'Điều chỉnh ghế lái': versionSpecs?.interior?.driverSeatAdjustment || '',
    'Hệ thống túi khí': versionSpecs?.safety?.airbagSystem || '',
    'Hệ thống ABS': versionSpecs?.safety?.abs || '',
    'Hệ thống EBD': versionSpecs?.safety?.ebd || '',
    ...(specsObj.specifications_flat && typeof specsObj.specifications_flat === 'object' ? specsObj.specifications_flat : {}),
  }

  const reconstructed = reconstructCarAdminConfiguration({
    productVariants: productVariants || [],
    vehicleVariants: vehicleVariants || [],
    inventoryByVariantId,
    declaredVersions: Object.keys(specsObj.specs || {}),
    colors,
    interiors,
  })
  interiors = reconstructed.interiors
  const compatibilityRows = Array.isArray(specsObj.variant_compatibility) ? specsObj.variant_compatibility : []
  const reconstructedVersions = reconstructed.versions.map((version) => {
    const rows = compatibilityRows.filter((entry: any) => entry.version === version.name)
    if (version.compatible_colors.length === 0 && rows.length > 0) {
      version.compatible_colors = Array.from(new Set(rows.map((entry: any) => String(entry.exterior_color))))
      version.interiors_by_color = Object.fromEntries(version.compatible_colors.map((exterior: string) => [
        exterior,
        Array.from(new Set(rows
          .filter((entry: any) => entry.exterior_color === exterior)
          .map((entry: any) => String(entry.interior_color))
          .filter(Boolean))),
      ]))
    }
    if (version.compatible_colors.length === 0) {
      version.compatible_colors = colors.map((color: any) => String(color.color_name))
      version.interiors_by_color = Object.fromEntries(version.compatible_colors.map((exterior: string) => [
        exterior,
        interiors.map((interior: any) => String(interior.interior_name)),
      ]))
    }
    return version
  })

  const formState = {
    name: product.name,
    slug: product.slug,
    description: product.description || '',
    is_active: product.is_active,
    listing_image_url,
    hero_image_url,
    logo_image_url: specsObj.logo_image_url || specsObj.logo_image || '',
    brochure_url: specsObj.brochure_url || '',
    detail_image_urls,
    specifications: reconstructedSpecifications,
    hidden_specifications: specsObj.hidden_specifications || [],
    custom_specifications: specsObj.custom_specifications || [],
    specification_fields: mergeVehicleSpecFields(normalizeVehicleSpecFields(specsObj.specification_fields), specsObj.specifications_flat || {}),
    colors,
    interiors,
    versions: reconstructedVersions,
    advanced_color_price: Number(product.advanced_color_price || Math.max(
      0,
      ...[...richColorByName.values()].map((color: any) => Number(color?.price_delta ?? 0)),
    )),
    landing_page_blocks: specsObj.landing_page_blocks || [],
  }

  return NextResponse.json({ data: formState })
}

export async function PATCH(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  const { productId } = await context.params
  if (!UUID_PATTERN.test(productId)) {
    return NextResponse.json({ error: 'Mã sản phẩm không hợp lệ.' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Nội dung JSON không hợp lệ.' }, { status: 400 })
  }

  // Prepend origin to relative upload URLs
  const requestUrl = new URL(request.url)
  const host = request.headers.get('host') || requestUrl.host
  const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol.startsWith('https') ? 'https' : 'http')
  const origin = `${proto}://${host}`
  
  body = makeUrlsAbsolute(body, origin)

  const {
    name,
    slug,
    description,
    is_active = true,
    listing_image_url,
    hero_image_url,
    logo_image_url = '',
    detail_image_urls = [],
    specifications = {},
    hidden_specifications = [],
    custom_specifications = [],
    colors = [],
    advanced_color_price = 0,
    interiors = [],
    versions = [],
    landing_page_blocks = [],
    specification_fields,
  } = body

  // Validation
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

  const colorNames = new Set(colors.map((color: any) => String(color.color_name)))
  const advancedColorPrice = Math.max(0, Number(advanced_color_price) || 0)
  const priceForConfiguration = (version: any, color: any) =>
    Number(version.price) + (color.color_type === 'ADVANCED' ? advancedColorPrice : 0)
  const interiorNames = new Set(interiors.map((interior: any) => String(interior.interior_name)))
  
  // Sync interior allowed_combinations back to version.interiors_by_color
  versions.forEach((version: any) => {
    version.interiors_by_color = {}
    const selectedColors = Array.isArray(version.compatible_colors)
      ? Array.from(new Set(version.compatible_colors.map(String)))
      : colors.map((color: any) => String(color.color_name))
      
    selectedColors.forEach((colorName: string) => {
      version.interiors_by_color[colorName] = interiors
        .filter((interior: any) => {
          if (!interior.allowed_combinations || interior.allowed_combinations.length === 0) return true
          return interior.allowed_combinations.includes(`${version.name}::${colorName}`)
        })
        .map((interior: any) => String(interior.interior_name))
    })
  })

  const sellableConfigurations = versions.flatMap((version: any, versionIndex: number) => {
    const selectedColors = Array.isArray(version.compatible_colors)
      ? Array.from(new Set(version.compatible_colors.map(String)))
      : colors.map((color: any) => String(color.color_name))
    return selectedColors.flatMap((colorName: string) => {
      if (!colorNames.has(colorName)) return []
      const selectedInteriors = Array.isArray(version.interiors_by_color?.[colorName])
        ? Array.from(new Set(version.interiors_by_color[colorName].map(String)))
        : interiors.map((interior: any) => String(interior.interior_name))
      return selectedInteriors.flatMap((interiorName: string) => {
        if (!interiorNames.has(interiorName)) return []
        const colorIndex = colors.findIndex((color: any) => color.color_name === colorName)
        const interiorIndex = interiors.findIndex((interior: any) => interior.interior_name === interiorName)
        return [{ version, versionIndex, color: colors[colorIndex], colorIndex, interior: interiors[interiorIndex], interiorIndex, interiorCount: selectedInteriors.length }]
      })
    })
  })
  const configurationSignatures = sellableConfigurations.map(
    ({ version, color, interior }: any) => `${version.sku}\u001f${color.color_name}\u001f${interior.interior_name}`,
  )
  if (sellableConfigurations.length === 0 || new Set(configurationSignatures).size !== configurationSignatures.length) {
    return NextResponse.json({ error: 'Các tổ hợp phiên bản, ngoại thất và nội thất phải hợp lệ, không trùng nhau.' }, { status: 400 })
  }
  if (sellableConfigurations.some(({ version, color, interior }: any) => {
    const value = Number(version.stock_by_configuration?.[JSON.stringify([color.color_name, interior.interior_name])] ?? 0)
    return !Number.isInteger(value) || value < 0
  })) {
    return NextResponse.json({ error: 'Tồn kho của từng cấu hình phải là số nguyên không âm.' }, { status: 400 })
  }
  if (sellableConfigurations.some(({ version, color }: any) => {
    const value = priceForConfiguration(version, color)
    return !Number.isFinite(value) || value <= 0
  })) {
    return NextResponse.json({ error: 'Giá bán của từng phiên bản và màu ngoại thất phải lớn hơn 0.' }, { status: 400 })
  }

  const displayedPrice = Math.min(...sellableConfigurations.map(({ version, color }: any) =>
    priceForConfiguration(version, color)))
  const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
  const configuredSpecFields = mergeVehicleSpecFields(normalizeVehicleSpecFields(specification_fields), specifications)
  const specValue = (key: string) => configuredSpecFields.find((field) => field.key === key)?.visible !== false
    ? specifications[key]
    : ''

  // Form structured image_urls array
  const image_urls: string[] = [listing_image_url, hero_image_url]
  colors.forEach((color: any) => {
    if (color.image_url) image_urls.push(color.image_url)
    if (color.swatch) image_urls.push(color.swatch)
  })
  interiors.forEach((interior: any) => {
    if (interior.image_url) image_urls.push(interior.image_url)
    if (interior.swatch) image_urls.push(interior.swatch)
  })
  detail_image_urls.forEach((url: string) => {
    if (url) image_urls.push(url)
  })

  // Format nested specifications specs by version
  const specsByVersion: Record<string, any> = {}
  versions.forEach((version: any) => {
    specsByVersion[version.name] = {
      price: version.price,
      specs: {
        powertrain: {
          distance: specValue('Quãng đường đi được') || '',
          maxPower: specValue('Công suất tối đa') || '',
          maxTorque: specValue('Mô-men xoắn cực đại') || '',
          topSpeed: specValue('Tốc độ tối đa') || '',
          drivetrain: specValue('Hệ dẫn động') || '',
          batteryCapacity: specValue('Dung lượng pin') || '',
          fastChargingTime: specValue('Thời gian sạc nhanh') || '',
          maxDCCharging: specValue('Công suất sạc DC tối đa') || '',
        },
        dimension: {
          length: specValue('Dài x Rộng x Cao') || '',
          wheelbase: specValue('Chiều dài cơ sở') || '',
          croundClearance: specValue('Khoảng sáng gầm xe') || '',
          kurbWeightPayload: specValue('Khối lượng / Tải trọng') || '',
        },
        exterior: {
          auto: specifications['Đèn chiếu sáng phía trước'] || '',
          lazang: specifications['Kích thước la-zăng'] || '',
        },
        interior: {
          numberOfSeats: Number(specValue('Số chỗ ngồi')) || specValue('Số chỗ ngồi') || 5,
          informationCenter: specifications['Hệ thống giải trí'] || '',
          airConditioner: specifications['Hệ thống điều hòa'] || '',
          driverSeatAdjustment: specifications['Điều chỉnh ghế lái'] || '',
        },
        safety: {
          airbagSystem: specifications['Hệ thống túi khí'] || '',
          abs: specifications['Hệ thống ABS'] || '',
          ebd: specifications['Hệ thống EBD'] || '',
        }
      }
    }
  })

  const formattedSpecs = {
    url: `https://vinfastauto.com/vn_vi/dat-coc-xe-${slug}`,
    name,
    price: `Chỉ từ ${priceFormatter.format(displayedPrice)}*`,
    specs: specsByVersion,
    deposit: `${new Intl.NumberFormat('vi-VN').format(versions[0]?.deposit_amount || 15000000)} VNĐ`,
    options: [],
    hidden_specifications,
    custom_specifications,
    range_km: Number(specifications['Quãng đường đi được']?.replace(/[^0-9]/g, '')) || 300,
    marketing: {
      design: {
        title: 'Dấu ấn thời đại. Phong thái dẫn đầu.',
        description: description,
        interior_title: 'Đẳng cấp thương gia',
        interior_description: 'Trải nghiệm không gian sang trọng và tiện nghi.'
      },
      safety: {
        title: 'Chuẩn an toàn cao cấp',
        features: [
          specifications['Hệ thống túi khí'] || 'Hệ thống túi khí an toàn',
          specifications['Hệ thống ABS'] ? 'Chống bó cứng phanh ABS' : null,
          specifications['Hệ thống EBD'] ? 'Phân phối lực phanh điện tử EBD' : null
        ].filter(Boolean),
        description: 'Được thiết kế để bảo vệ tối đa hành khách trên mọi cung đường.'
      },
      technology: {
        title: 'Hệ sinh thái thông minh',
        features: [
          'Trợ lý ảo thông minh',
          specifications['Hệ thống giải trí'] || 'Màn hình trung tâm hiện đại'
        ],
        description: 'Kết nối mọi hành trình của bạn.'
      }
    },
    logo_image: logo_image_url || '',
    logo_image_url: logo_image_url || '',
    range_text: specifications['Quãng đường đi được'] || '',
    seat_count: Number(specifications['Số chỗ ngồi']) || 5,
    banner_image: hero_image_url,
    product_type: 'car',
    gallery_images: detail_image_urls,
    variants_specs: {},
    fallback_colors: colors.map((c: any) => ({
      name: c.color_name,
      image: c.image_url,
      swatch: c.swatch,
      color_type: c.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
      price_adjustment: c.color_type === 'ADVANCED' ? advancedColorPrice : 0,
    })),
    fallback_color_images: colors.map((c: any) => c.image_url),
    interiors: interiors.map((i: any) => ({
      name: i.interior_name,
      image: i.image_url,
      swatch: i.swatch,
      image_urls: i.image_urls || (i.image_url ? [i.image_url] : []),
      allowed_combinations: i.allowed_combinations || []
    })),
    variant_compatibility: sellableConfigurations.map(({ version, color, interior }: any) => ({
      version: version.name,
      exterior_color: color.color_name,
      interior_color: interior.interior_name,
    })),
    gallery: {
      all_images: image_urls,
      tech_images: [],
      banner_images: [hero_image_url],
      exterior_images: colors.map((c: any) => c.image_url),
      interior_images: interiors.map((i: any) => i.image_url),
      detail_images: detail_image_urls,
    },
    landing_page_blocks
    , specification_fields: mergeVehicleSpecFields(normalizeVehicleSpecFields(specification_fields), specifications)
    , specifications_flat: specifications
  }

  const supabase = getSupabaseAdmin()

  // 1. Update product
  const { error: productError } = await supabase
    .from('products')
    .update({
      name,
      slug,
      description,
      is_active,
      specifications: formattedSpecs,
      image_urls,
      displayed_price: displayedPrice,
      advanced_color_price: advancedColorPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)

  if (productError) {
    return NextResponse.json({ error: `Lỗi cập nhật sản phẩm: ${productError.message}` }, { status: 500 })
  }

  // 2. Fetch existing relations to preserve IDs and identify deletions
  const { data: existingPV } = await supabase.from('product_variants').select('id, sku, metadata').eq('product_id', productId)
  const productVariantById = new Map((existingPV || []).map((row: any) => [String(row.id), row]))

  const { data: existingVV } = await supabase
    .from('vehicle_variants')
    .select('id, sku, product_variant_id, version, color, interior_color')
    .eq('product_id', productId)
  const vehicleVariantByConfiguration = new Map<string, any>()
  for (const row of existingVV || []) {
    const key = vehicleConfigurationKey({ version: row.version, color: row.color, interiorColor: row.interior_color })
    if (!vehicleVariantByConfiguration.has(key)) vehicleVariantByConfiguration.set(key, row)
  }

  // 3. Form new rows
  const assignments = sellableConfigurations.map(({ version, color, interior }: any) => {
    const existingVehicle = vehicleVariantByConfiguration.get(vehicleConfigurationKey({
      version: version.name,
      color: color.color_name,
      interiorColor: interior.interior_name,
    }))
    const existingProduct = existingVehicle?.product_variant_id
      ? productVariantById.get(String(existingVehicle.product_variant_id))
      : undefined
    return { existingVehicle, existingProduct }
  })
  let allocatedSkus: string[]
  try {
    allocatedSkus = await allocateVehicleVariantSkus(supabase, 'CAR', assignments.filter((item: { existingProduct?: unknown }) => !item.existingProduct).length)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể cấp SKU xe ô tô.' }, { status: 500 })
  }
  let allocatedSkuIndex = 0
  const productVariantRows = sellableConfigurations.map(({ version, color, interior }: any, rowIndex: number) => {
    const assignment = assignments[rowIndex]
    const sku = assignment.existingProduct?.sku || allocatedSkus[allocatedSkuIndex++]
    return {
    id: assignment.existingProduct?.id || randomUUID(),
    product_id: productId,
    sku,
    name: `${version.name} - ${color.color_name} - ${interior.interior_name}`,
      original_price: priceForConfiguration(version, color),
    sale_price: null,
    is_active: is_active,
    option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}&color=${String(color.color_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}&interior=${String(interior.interior_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    metadata: { source: 'admin_car_edit', base_sku: normalizeCarSkuBase(version.sku, color.color_name, interior.interior_name), version: version.name, color: color.color_name, interior_color: interior.interior_name },
    deposit_amount: version.deposit_amount,
    }
  })

  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, rowIndex: number) => {
      const { versionIndex, colorIndex, color: colorItem, interior: interiorItem } = sellableConfigurations[rowIndex]
      const sourceVersion = versions[versionIndex]
      const sku = variantRow.sku
      const catalogSpecs = {
        ...formattedSpecs,
        catalog: {
          source: 'products/product_variants',
          sale_price: null,
          color_order: colorIndex + 1,
          color_type: colorItem.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
          color_price_adjustment: colorItem.color_type === 'ADVANCED' ? advancedColorPrice : 0,
          description,
          migrated_at: generatedAt,
          product_slug: slug,
          version_order: versionIndex + 1,
          version_sku: sourceVersion.sku,
          hero_image_url,
          original_price: Number(variantRow.original_price),
          detail_image_urls: detail_image_urls,
          listing_image_url,
          interior_color: interiorItem.interior_name,
          interior_image_url: interiorItem.image_url,
          interior_swatch_url: interiorItem.swatch,
        },
      }

      vehicleVariantRows.push({
        id: assignments[rowIndex].existingVehicle?.id || randomUUID(),
        product_id: productId,
        product_type: 'CAR',
        product_name: name,
        deposit_amount: variantRow.deposit_amount,
        specs: catalogSpecs,
        variant_name: `${name} ${sourceVersion.name} - ${colorItem.color_name} - ${interiorItem.interior_name}`,
        sku,
        price: variantRow.original_price,
        color: colorItem.color_name,
        image_car_url: colorItem.images_by_version?.[sourceVersion.name] || colorItem.image_url,
        image_color_url: colorItem.swatch,
        color_type: colorItem.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
        color_price_adjustment: colorItem.color_type === 'ADVANCED' ? advancedColorPrice : 0,
        version: sourceVersion.name,
        interior_color: interiorItem.interior_name,
        is_active: is_active,
        product_variant_id: variantRow.id,
      })
  })

  // 4. Perform deletions
  const newPvIds = new Set(productVariantRows.map((row: any) => String(row.id)))
  const pvIdsToDelete = (existingPV || []).filter((row: any) => !newPvIds.has(String(row.id))).map((row: any) => row.id)

  if (pvIdsToDelete.length > 0) {
    await supabase.from('inventory_items').delete().in('variant_id', pvIdsToDelete)
    await supabase.from('cart_items').delete().in('variant_id', pvIdsToDelete)
    await supabase.from('product_media').delete().in('variant_id', pvIdsToDelete)
    await supabase.from('vehicle_variants').delete().in('product_variant_id', pvIdsToDelete)

    const { error: pvDelError } = await supabase
      .from('product_variants')
      .delete()
      .in('id', pvIdsToDelete)
      .eq('product_id', productId)
    if (pvDelError) {
      if (pvDelError.code === '23503') {
        const { error: pvUpdateError } = await supabase
          .from('product_variants')
          .update({ is_active: false })
          .in('id', pvIdsToDelete)
          .eq('product_id', productId)
        if (pvUpdateError) {
          return NextResponse.json({ error: `Lỗi vô hiệu hóa phiên bản cũ: ${pvUpdateError.message}` }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: `Lỗi xóa phiên bản cũ: ${pvDelError.message}` }, { status: 500 })
      }
    }
  }

  const newVvIds = new Set(vehicleVariantRows.map((row) => String(row.id)))
  const vvIdsToDelete = (existingVV || []).filter((row: any) => !newVvIds.has(String(row.id))).map((row: any) => row.id)

  if (vvIdsToDelete.length > 0) {
    const { error: vvDelError } = await supabase
      .from('vehicle_variants')
      .delete()
      .in('id', vvIdsToDelete)
      .eq('product_id', productId)
    if (vvDelError) {
      if (vvDelError.code === '23503') {
        const { error: vvUpdateError } = await supabase
          .from('vehicle_variants')
          .update({ is_active: false })
          .in('id', vvIdsToDelete)
          .eq('product_id', productId)
        if (vvUpdateError) {
          return NextResponse.json({ error: `Lỗi vô hiệu hóa cấu hình xe cũ: ${vvUpdateError.message}` }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: `Lỗi xóa cấu hình xe cũ: ${vvDelError.message}` }, { status: 500 })
      }
    }
  }

  // 5. Upsert new/updated rows mapping conflict on id
  const { error: pvUpsertError } = await supabase
    .from('product_variants')
    .upsert(productVariantRows, { onConflict: 'id' })

  if (pvUpsertError) {
    return NextResponse.json({ error: `Lỗi lưu phiên bản sản phẩm: ${pvUpsertError.message}` }, { status: 500 })
  }

  // 5.1 Persist inventory for each exact version/exterior/interior combination.
  const inventoryRows = productVariantRows.map((r: any, rowIndex: number) => {
    const { version, color, interior } = sellableConfigurations[rowIndex]
    return {
      variant_id: r.id,
      on_hand_quantity: Number(
        version.stock_by_configuration?.[JSON.stringify([color.color_name, interior.interior_name])] ?? 0,
      ),
      updated_at: new Date().toISOString(),
    }
  })

  const { error: invUpsertError } = await supabase
    .from('inventory_items')
    .upsert(inventoryRows, { onConflict: 'variant_id' })

  if (invUpsertError) {
    return NextResponse.json({ error: `Lỗi lưu tồn kho cấu hình xe: ${invUpsertError.message}` }, { status: 500 })
  }

  const { error: vvUpsertError } = await supabase
    .from('vehicle_variants')
    .upsert(vehicleVariantRows, { onConflict: 'id' })

  if (vvUpsertError) {
    return NextResponse.json({ error: `Lỗi lưu cấu hình xe: ${vvUpsertError.message}` }, { status: 500 })
  }

  revalidateTag('car-catalog')
  revalidateTag('vehicle-catalog')
  await Promise.all([
    deleteRedisKeysByPrefix(CAR_CATALOG_CACHE_PREFIX),
    deleteRedisKeysByPrefix(CAR_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  const { productId } = await context.params
  if (!UUID_PATTERN.test(productId)) {
    return NextResponse.json({ error: 'Mã sản phẩm không hợp lệ.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 1. Get variant IDs to delete child records first
  const { data: variants } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)

  const variantIds = variants?.map((v) => v.id) || []

  // 2. Clean up child records in related tables
  if (variantIds.length > 0) {
    await supabase.from('inventory_items').delete().in('variant_id', variantIds)
    await supabase.from('cart_items').delete().in('variant_id', variantIds)
    await supabase.from('product_media').delete().in('variant_id', variantIds)
  }

  await supabase.from('product_media').delete().eq('product_id', productId)

  // 3. Delete from product tables
  const { error: vvError } = await supabase
    .from('vehicle_variants')
    .delete()
    .eq('product_id', productId)

  if (vvError) {
    return NextResponse.json({ error: `Lỗi xóa cấu hình xe: ${vvError.message}` }, { status: 500 })
  }

  const { error: pvError } = await supabase
    .from('product_variants')
    .delete()
    .eq('product_id', productId)

  if (pvError) {
    return NextResponse.json({ error: `Lỗi xóa phiên bản sản phẩm: ${pvError.message}` }, { status: 500 })
  }

  const { error: productError } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)

  if (productError) {
    return NextResponse.json({ error: `Lỗi xóa sản phẩm xe ô tô: ${productError.message}` }, { status: 500 })
  }

  revalidateTag('car-catalog')
  revalidateTag('vehicle-catalog')
  await Promise.all([
    deleteRedisKeysByPrefix(CAR_CATALOG_CACHE_PREFIX),
    deleteRedisKeysByPrefix(CAR_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({ success: true })
}
