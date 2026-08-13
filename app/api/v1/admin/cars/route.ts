import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKeysByPrefix } from '@/lib/redis'
import { CAR_CATALOG_CACHE_PREFIX, CAR_DETAIL_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'

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
    is_active = true,
    listing_image_url,
    hero_image_url,
    logo_image_url = '',
    detail_image_urls = [],
    specifications = {},
    colors = [],
    interiors = [],
    versions = [],
    advanced_color_price = 0,
    landing_page_blocks = [],
  } = body

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
  const colorNames = new Set(colors.map((color: any) => String(color.color_name)))
  const advancedColorPrice = Math.max(0, Number(advanced_color_price) || 0)
  const priceForConfiguration = (version: any, color: any) =>
    Number(version.price) + (color.color_type === 'ADVANCED' ? advancedColorPrice : 0)
  const interiorNames = new Set(interiors.map((interior: any) => String(interior.interior_name)))
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
        return [{ version, versionIndex, color: colors[colorIndex], colorIndex, interior: interiors[interiorIndex], interiorIndex }]
      })
    })
  })
  const configurationSignatures = sellableConfigurations.map(({ version, color, interior }: any) => `${version.sku}\u001f${color.color_name}\u001f${interior.interior_name}`)
  if (sellableConfigurations.length === 0 || new Set(configurationSignatures).size !== configurationSignatures.length) {
    return NextResponse.json({ error: 'Các tổ hợp phiên bản, ngoại thất và nội thất phải hợp lệ, không trùng nhau.' }, { status: 400 })
  }
  if (sellableConfigurations.some(({ version, color, interior }: any) => {
    const stockKey = JSON.stringify([color.color_name, interior.interior_name])
    const value = Number(version.stock_by_configuration?.[stockKey] ?? 0)
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

  const productId = randomUUID()
  const categoryId = '8ddad94f-775b-3b0d-ea74-54286bb42b8c' // Ô tô điện category ID
  const displayedPrice = Math.min(...sellableConfigurations.map(({ version, color }: any) =>
    priceForConfiguration(version, color)))

  // Format price string for specifications
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
      swatch: c.swatch,
      color_type: c.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
      price_adjustment: c.color_type === 'ADVANCED' ? advancedColorPrice : 0,
    })),
    fallback_color_images: colors.map((c: any) => c.image_url),
    interiors: interiors.map((i: any) => ({
      name: i.interior_name,
      image: i.image_url,
      swatch: i.swatch
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
  }

  const supabase = getSupabaseAdmin()

  // 1. Insert into products
  const { error: productError } = await supabase
    .from('products')
    .insert({
      id: productId,
      category_id: categoryId,
      name,
      slug,
      description,
      product_type: 'CAR',
      is_active,
      specifications: formattedSpecs,
      image_urls,
      displayed_price: displayedPrice,
      advanced_color_price: advancedColorPrice,
    })

  if (productError) {
    return NextResponse.json({ error: `Lỗi tạo sản phẩm: ${productError.message}` }, { status: 500 })
  }

  // One row represents one exact sellable version + exterior + interior triple.
  const productVariantRows = sellableConfigurations.map(({ version, color, colorIndex, interior, interiorIndex }: any) => ({
    id: randomUUID(),
    product_id: productId,
    sku: `${version.sku}-C${String(colorIndex + 1).padStart(2, '0')}-I${String(interiorIndex + 1).padStart(2, '0')}`,
    name: `${version.name} - ${color.color_name} - ${interior.interior_name}`,
    original_price: priceForConfiguration(version, color),
    sale_price: null,
    is_active: is_active,
    option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}&color=${String(color.color_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}&interior=${String(interior.interior_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    metadata: {
      source: 'admin_car_creation',
      base_sku: version.sku,
      version: version.name,
      color: color.color_name,
      interior_color: interior.interior_name,
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

  const inventoryRows = productVariantRows.map((row: any, rowIndex: number) => {
    const { version, color, interior } = sellableConfigurations[rowIndex]
    return {
    variant_id: row.id,
    on_hand_quantity: Number(version.stock_by_configuration?.[JSON.stringify([color.color_name, interior.interior_name])] ?? 0),
    updated_at: new Date().toISOString()
    }
  })

  const { error: invError } = await supabase
    .from('inventory_items')
    .insert(inventoryRows)

  if (invError) {
    await supabase.from('product_variants').delete().eq('product_id', productId)
    await supabase.from('products').delete().eq('id', productId)
    return NextResponse.json({ error: `Lỗi tạo tồn kho: ${invError.message}` }, { status: 500 })
  }

  // 3. Insert one vehicle_variant for each sellable product variant.
  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, rowIndex: number) => {
      const { versionIndex, colorIndex, color: colorItem, interior: interiorItem } = sellableConfigurations[rowIndex]
      const sourceVersion = versions[versionIndex]
      const variantId = randomUUID()
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
        id: variantId,
        product_id: productId,
        product_type: 'CAR',
        product_name: name,
        deposit_amount: variantRow.deposit_amount,
        specs: catalogSpecs,
        variant_name: `${name} ${sourceVersion.name} - ${colorItem.color_name} - ${interiorItem.interior_name}`,
        sku: variantRow.sku,
        price: variantRow.original_price,
        color: colorItem.color_name,
        image_car_url: colorItem.image_url,
        image_color_url: colorItem.swatch,
        version: sourceVersion.name,
        is_active: is_active,
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

  revalidateTag('car-catalog')
  revalidateTag('vehicle-catalog')
  await Promise.all([
    deleteRedisKeysByPrefix(CAR_CATALOG_CACHE_PREFIX),
    deleteRedisKeysByPrefix(CAR_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({
    success: true,
    productId,
    slug,
  }, { status: 201 })
}
