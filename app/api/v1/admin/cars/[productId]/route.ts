import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import path from 'path'
import fs from 'fs'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKeysByPrefix } from '@/lib/redis'
import { CAR_CATALOG_CACHE_PREFIX, CAR_DETAIL_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'

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

  const specsObj = product.specifications || {}
  const image_urls = product.image_urls || []

  const colors = (specsObj.fallback_colors || []).map((c: any) => ({
    color_name: c.name,
    image_url: c.image,
    swatch: c.swatch
  }))

  const interiors = (specsObj.interiors || []).map((i: any) => ({
    interior_name: i.name,
    image_url: i.image,
    swatch: i.swatch
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
  }

  const formState = {
    name: product.name,
    slug: product.slug,
    description: product.description || '',
    is_active: product.is_active,
    listing_image_url,
    hero_image_url,
    logo_image_url: specsObj.logo_image_url || specsObj.logo_image || '',
    detail_image_urls,
    specifications: reconstructedSpecifications,
    colors,
    interiors,
    versions: (productVariants || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: Number(v.original_price),
      deposit_amount: Number(v.deposit_amount),
    })),
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
    colors = [],
    interiors = [],
    versions = [],
    landing_page_blocks = [],
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

  const displayedPrice = Math.min(...versions.map((v: any) => Number(v.price)))
  const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

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
          distance: specifications['Quãng đường đi được'] || '',
          maxPower: specifications['Công suất tối đa'] || '',
          maxTorque: specifications['Mô-men xoắn cực đại'] || '',
          topSpeed: specifications['Tốc độ tối đa'] || '',
          drivetrain: specifications['Hệ dẫn động'] || '',
          batteryCapacity: specifications['Dung lượng pin'] || '',
          fastChargingTime: specifications['Thời gian sạc nhanh'] || '',
          maxDCCharging: specifications['Công suất sạc DC tối đa'] || '',
        },
        dimension: {
          length: specifications['Dài x Rộng x Cao'] || '',
          wheelbase: specifications['Chiều dài cơ sở'] || '',
          croundClearance: specifications['Khoảng sáng gầm xe'] || '',
          kurbWeightPayload: specifications['Khối lượng / Tải trọng'] || '',
        },
        exterior: {
          auto: specifications['Đèn chiếu sáng phía trước'] || '',
          lazang: specifications['Kích thước la-zăng'] || '',
        },
        interior: {
          numberOfSeats: Number(specifications['Số chỗ ngồi']) || specifications['Số chỗ ngồi'] || 5,
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
      swatch: c.swatch
    })),
    fallback_color_images: colors.map((c: any) => c.image_url),
    interiors: interiors.map((i: any) => ({
      name: i.interior_name,
      image: i.image_url,
      swatch: i.swatch
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)

  if (productError) {
    return NextResponse.json({ error: `Lỗi cập nhật sản phẩm: ${productError.message}` }, { status: 500 })
  }

  // 2. Fetch existing relations to preserve IDs and identify deletions
  const { data: existingPV } = await supabase.from('product_variants').select('id, sku').eq('product_id', productId)
  const pvMap = new Map(existingPV?.map((r) => [r.sku, r.id]) || [])

  const { data: existingVV } = await supabase.from('vehicle_variants').select('id, sku').eq('product_id', productId)
  const vvMap = new Map(existingVV?.map((r) => [r.sku, r.id]) || [])

  // 3. Form new rows
  const productVariantRows = versions.map((version: any) => ({
    id: pvMap.get(version.sku) || randomUUID(),
    product_id: productId,
    sku: version.sku,
    name: version.name,
    original_price: version.price,
    sale_price: null,
    is_active: is_active,
    option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    metadata: { source: 'admin_car_edit' },
    deposit_amount: version.deposit_amount,
  }))

  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, versionIndex: number) => {
    colors.forEach((colorItem: any, colorIndex: number) => {
      const sku = `${variantRow.sku}-C${String(colorIndex + 1).padStart(2, '0')}`
      const catalogSpecs = {
        ...formattedSpecs,
        catalog: {
          source: 'products/product_variants',
          sale_price: null,
          color_order: colorIndex + 1,
          description,
          migrated_at: generatedAt,
          product_slug: slug,
          version_order: versionIndex + 1,
          hero_image_url,
          original_price: Number(variantRow.original_price),
          detail_image_urls: detail_image_urls,
          listing_image_url,
        },
      }

      vehicleVariantRows.push({
        id: vvMap.get(sku) || randomUUID(),
        product_id: productId,
        product_type: 'CAR',
        product_name: name,
        deposit_amount: variantRow.deposit_amount,
        specs: catalogSpecs,
        variant_name: `${name} ${variantRow.name} - ${colorItem.color_name}`,
        sku,
        price: variantRow.original_price,
        color: colorItem.color_name,
        image_car_url: colorItem.image_url,
        image_color_url: colorItem.swatch,
        version: variantRow.name,
        is_active: is_active,
        product_variant_id: variantRow.id,
      })
    })
  })

  // 4. Perform deletions
  const newPvSkus = productVariantRows.map((r: any) => r.sku)
  const existingPvSkus = existingPV?.map((r) => r.sku) || []
  const pvSkusToDelete = existingPvSkus.filter((s) => !newPvSkus.includes(s))

  if (pvSkusToDelete.length > 0) {
    const { data: pvToDelete } = await supabase
      .from('product_variants')
      .select('id')
      .in('sku', pvSkusToDelete)
      .eq('product_id', productId)

    const pvIdsToDelete = pvToDelete?.map((v: any) => v.id) || []

    if (pvIdsToDelete.length > 0) {
      await supabase.from('inventory_items').delete().in('variant_id', pvIdsToDelete)
      await supabase.from('cart_items').delete().in('variant_id', pvIdsToDelete)
      await supabase.from('product_media').delete().in('variant_id', pvIdsToDelete)
      await supabase.from('vehicle_variants').delete().in('product_variant_id', pvIdsToDelete)
    }

    const { error: pvDelError } = await supabase
      .from('product_variants')
      .delete()
      .in('sku', pvSkusToDelete)
      .eq('product_id', productId)
    if (pvDelError) {
      return NextResponse.json({ error: `Lỗi xóa phiên bản cũ: ${pvDelError.message}` }, { status: 500 })
    }
  }

  const newVvSkus = vehicleVariantRows.map((r) => r.sku)
  const existingVvSkus = existingVV?.map((r) => r.sku) || []
  const vvSkusToDelete = existingVvSkus.filter((s) => !newVvSkus.includes(s))

  if (vvSkusToDelete.length > 0) {
    const { error: vvDelError } = await supabase
      .from('vehicle_variants')
      .delete()
      .in('sku', vvSkusToDelete)
      .eq('product_id', productId)
    if (vvDelError) {
      return NextResponse.json({ error: `Lỗi xóa cấu hình xe cũ: ${vvDelError.message}` }, { status: 500 })
    }
  }

  // 5. Upsert new/updated rows mapping conflict on id
  const { error: pvUpsertError } = await supabase
    .from('product_variants')
    .upsert(productVariantRows, { onConflict: 'id' })

  if (pvUpsertError) {
    return NextResponse.json({ error: `Lỗi lưu phiên bản sản phẩm: ${pvUpsertError.message}` }, { status: 500 })
  }

  // 5.1 Ensure inventory_items exist for all these variants so they are not out of stock
  const inventoryRows = productVariantRows.map((r: any) => ({
    variant_id: r.id,
    on_hand_quantity: 100,
    updated_at: new Date().toISOString()
  }))

  const { error: invUpsertError } = await supabase
    .from('inventory_items')
    .upsert(inventoryRows, { onConflict: 'variant_id', ignoreDuplicates: true })

  if (invUpsertError) {
    console.warn('Failed to upsert default inventory for variants:', invUpsertError)
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
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({ success: true })
}
