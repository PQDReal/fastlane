import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'
import { MOTORBIKE_CATALOG_CACHE_KEY, MOTORBIKE_DETAIL_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'

function handleAuthorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
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

  const {
    name,
    slug,
    description,
    is_active = true,
    listing_image_url,
    hero_image_url,
    detail_image_urls = [],
    specifications = {},
    colors = [],
    versions = [],
  } = body

  // Basic validation
  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Tên xe và slug không được để trống.' }, { status: 400 })
  }
  if (!listing_image_url || !hero_image_url) {
    return NextResponse.json({ error: 'Hình ảnh thumbnail và hình landing page không được để trống.' }, { status: 400 })
  }
  if (detail_image_urls.length !== 3) {
    return NextResponse.json({ error: 'Landing page yêu cầu chính xác 3 hình chi tiết.' }, { status: 400 })
  }
  if (colors.length === 0) {
    return NextResponse.json({ error: 'Vui lòng thêm ít nhất một màu sắc.' }, { status: 400 })
  }
  if (versions.length === 0) {
    return NextResponse.json({ error: 'Vui lòng thêm ít nhất một phiên bản.' }, { status: 400 })
  }

  const productId = randomUUID()
  const categoryId = '6dfde2e5-b9d5-755c-10db-19a7ce6c24b5' // Xe máy điện category ID

  // Format price string for specifications
  const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
  const priceStr = versions.map((v: any) => `${v.name}: ${priceFormatter.format(v.price)}`).join(' / ')

  // Form structured image_urls array
  // Format: [ listing_image, hero_image, color1_car, color1_swatch, color2_car, color2_swatch, ..., detail1, detail2, detail3 ]
  const image_urls: string[] = [listing_image_url, hero_image_url]
  colors.forEach((color: any) => {
    image_urls.push(color.image_url)
    image_urls.push(color.swatch)
  })
  detail_image_urls.forEach((url: string) => {
    image_urls.push(url)
  })

  // Format specifications JSON
  const formattedSpecs = {
    url: `https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-${slug}`,
    name,
    price: priceStr,
    specs: specifications,
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
    product_type: 'motorbike',
    color_details: colors.map((c: any) => ({
      swatch: c.swatch,
      image_url: c.image_url,
      color_name: c.color_name,
    })),
    detail_images: detail_image_urls,
    representative_image: hero_image_url,
  }

  const displayedPrice = Math.min(...versions.map((v: any) => Number(v.price)))

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
      product_type: 'BIKE',
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
    metadata: { source: 'admin_motorbike_creation' },
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

  productVariantRows.forEach((variantRow: any, versionIndex: number) => {
    const origVersion = versions[versionIndex]
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
        product_type: 'BIKE',
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

  revalidateTag('motorbike-catalog')
  await Promise.all([
    deleteRedisKey(MOTORBIKE_CATALOG_CACHE_KEY),
    deleteRedisKeysByPrefix(MOTORBIKE_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({
    success: true,
    productId,
    slug,
  }, { status: 201 })
}
