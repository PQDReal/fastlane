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

  const productId = randomUUID()
  const categoryId = '8ddad94f-775b-3b0d-ea74-54286bb42b8c' // Ô tô điện category ID
  const displayedPrice = Math.min(...versions.map((v: any) => Number(v.price)))

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
    })

  if (productError) {
    return NextResponse.json({ error: `Lỗi tạo sản phẩm: ${productError.message}` }, { status: 500 })
  }

  // 2. Insert into product_variants
  const productVariantRows = versions.map((version: any) => ({
    id: randomUUID(),
    product_id: productId,
    sku: version.sku,
    name: version.name,
    original_price: version.price,
    sale_price: null,
    is_active: is_active,
    option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    metadata: { source: 'admin_car_creation' },
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

  // 2.1 Insert default inventory_items
  const inventoryRows = productVariantRows.map((r: any) => ({
    variant_id: r.id,
    on_hand_quantity: 100,
    updated_at: new Date().toISOString()
  }))

  const { error: invError } = await supabase
    .from('inventory_items')
    .insert(inventoryRows)

  if (invError) {
    console.warn('Failed to insert default inventory for new car variants:', invError)
  }

  // 3. Insert into vehicle_variants (versions * colors combinations)
  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, versionIndex: number) => {
    colors.forEach((colorItem: any, colorIndex: number) => {
      const variantId = randomUUID()
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
        id: variantId,
        product_id: productId,
        product_type: 'CAR',
        product_name: name,
        deposit_amount: variantRow.deposit_amount,
        specs: catalogSpecs,
        variant_name: `${name} ${variantRow.name} - ${colorItem.color_name}`,
        sku: `${variantRow.sku}-C${String(colorIndex + 1).padStart(2, '0')}`,
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
