import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'
import { MOTORBIKE_CATALOG_CACHE_KEY, MOTORBIKE_DETAIL_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'
import { reconstructMotorbikeAdminVersions } from '@/lib/motorbike-admin-variants'

type Context = { params: Promise<{ productId: string }> }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function handleAuthorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
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
    .eq('product_type', 'BIKE')
    .maybeSingle()

  if (productError) {
    return NextResponse.json({ error: `Lỗi tải sản phẩm: ${productError.message}` }, { status: 500 })
  }
  if (!product) {
    return NextResponse.json({ error: 'Không tìm thấy sản phẩm xe máy điện.' }, { status: 404 })
  }

  // Load product variants
  const { data: productVariants, error: pvError } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)

  if (pvError) {
    return NextResponse.json({ error: `Lỗi tải phiên bản sản phẩm: ${pvError.message}` }, { status: 500 })
  }

  // Reconstruct form state
  const specsObj = product.specifications || {}
  const image_urls = product.image_urls || []
  
  const listing_image_url = specsObj.catalog?.listing_image_url || image_urls[0] || ''
  const hero_image_url = specsObj.catalog?.hero_image_url || image_urls[1] || ''
  const detail_image_urls = specsObj.detail_images || image_urls.slice(-3) || ['', '', '']
  
  // Pad detail images to ensure 3 items
  while (detail_image_urls.length < 3) {
    detail_image_urls.push('')
  }

  const formState = {
    name: product.name,
    slug: product.slug,
    description: product.description || '',
    is_active: product.is_active,
    listing_image_url,
    hero_image_url,
    detail_image_urls,
    specifications: specsObj.specs || {},
    colors: specsObj.color_details || [],
    versions: reconstructMotorbikeAdminVersions(
      productVariants || [],
      specsObj.variants,
      specsObj.color_details || [],
    ),
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

  const categoryId = '6dfde2e5-b9d5-755c-10db-19a7ce6c24b5'

  // Format specifications
  const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
  const priceStr = versions.map((v: any) => `${v.name}: ${priceFormatter.format(v.price)}`).join(' / ')

  const image_urls: string[] = [listing_image_url, hero_image_url]
  colors.forEach((color: any) => {
    image_urls.push(color.image_url)
    image_urls.push(color.swatch)
  })
  detail_image_urls.forEach((url: string) => {
    image_urls.push(url)
  })

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
    landing_page_blocks,
  }

  const displayedPrice = Math.min(...versions.map((v: any) => Number(v.price)))

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
  const productVariantRows = versions.flatMap((version: any) =>
    colors.map((colorItem: any, colorIndex: number) => {
      const sku = `${version.sku}-C${String(colorIndex + 1).padStart(2, '0')}`
      return {
        id: pvMap.get(sku) || randomUUID(),
        product_id: productId,
        sku,
        name: `${version.name} - ${colorItem.color_name}`,
        original_price: version.price,
        sale_price: null,
        is_active: is_active,
        option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}&color=${String(colorItem.color_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        metadata: { source: 'admin_motorbike_edit', version: version.name, color: colorItem.color_name },
        deposit_amount: version.deposit_amount,
      }
    }),
  )

  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, rowIndex: number) => {
      const versionIndex = Math.floor(rowIndex / colors.length)
      const colorIndex = rowIndex % colors.length
      const originalVersion = versions[versionIndex]
      const colorItem = colors[colorIndex]
      const sku = variantRow.sku
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
        product_type: 'BIKE',
        product_name: name,
        deposit_amount: variantRow.deposit_amount,
        specs: catalogSpecs,
        variant_name: `${name} ${originalVersion.name} - ${colorItem.color_name}`,
        sku,
        price: variantRow.original_price,
        color: colorItem.color_name,
        image_car_url: colorItem.image_url,
        image_color_url: colorItem.swatch,
        version: originalVersion.name,
        is_active: is_active,
      })
  })

  // 4. Perform deletions
  const newPvSkus = productVariantRows.map((r: any) => r.sku)
  const existingPvSkus = existingPV?.map((r) => r.sku) || []
  const pvSkusToDelete = existingPvSkus.filter((s) => !newPvSkus.includes(s))

  if (pvSkusToDelete.length > 0) {
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

  // Keep every sellable colour row linked to its product variant and ensure
  // an inventory row exists when an edited product was created by the Admin
  // flow. Legacy rows without a matching SKU remain visible but are treated
  // as unmapped until explicitly migrated.
  const { data: savedVariants } = await supabase
    .from('product_variants')
    .select('id,sku')
    .eq('product_id', productId)
  const savedBySku = new Map((savedVariants ?? []).map((row) => [row.sku, row.id]))
  const mappedVehicleRows = vehicleVariantRows.map((row: any) => ({
    ...row,
    product_variant_id: savedBySku.get(row.sku) ?? null,
  }))
  const mappedIds = mappedVehicleRows
    .map((row: any) => row.product_variant_id)
    .filter(Boolean)
  if (mappedIds.length > 0) {
    const { data: existingInventory } = await supabase
      .from('inventory_items')
      .select('variant_id')
      .in('variant_id', mappedIds)
    const existingIds = new Set((existingInventory ?? []).map((row) => row.variant_id))
    const missingInventory = mappedIds
      .filter((id: string) => !existingIds.has(id))
      .map((variant_id: string) => ({ variant_id, on_hand_quantity: 0 }))
    if (missingInventory.length > 0) {
      const { error: inventoryError } = await supabase.from('inventory_items').insert(missingInventory)
      if (inventoryError) return NextResponse.json({ error: `Lỗi tạo tồn kho: ${inventoryError.message}` }, { status: 500 })
    }
  }

  const { error: vvUpsertError } = await supabase
    .from('vehicle_variants')
    .upsert(mappedVehicleRows, { onConflict: 'id' })

  if (vvUpsertError) {
    return NextResponse.json({ error: `Lỗi lưu cấu hình xe: ${vvUpsertError.message}` }, { status: 500 })
  }

  revalidateTag('motorbike-catalog')
  await Promise.all([
    deleteRedisKey(MOTORBIKE_CATALOG_CACHE_KEY),
    deleteRedisKeysByPrefix(MOTORBIKE_DETAIL_CACHE_PREFIX),
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

  // Never start a destructive cascade when the product is already part of a
  // deposit order. The database would reject the final product deletion, but
  // without this preflight all child variants and inventory would already be
  // gone by then.
  const { data: referencedDeposit, error: depositReferenceError } = await supabase
    .from('deposit_orders')
    .select('id')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle()

  if (depositReferenceError) {
    return NextResponse.json(
      { error: `Không thể kiểm tra đơn đặt cọc liên quan: ${depositReferenceError.message}` },
      { status: 500 },
    )
  }
  if (referencedDeposit) {
    return NextResponse.json(
      {
        error: 'Sản phẩm đã phát sinh đơn đặt cọc nên không thể xóa. Hãy chuyển sản phẩm sang trạng thái ngừng hoạt động.',
        code: 'PRODUCT_IN_USE',
      },
      { status: 409 },
    )
  }

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
    return NextResponse.json({ error: `Lỗi xóa sản phẩm xe máy: ${productError.message}` }, { status: 500 })
  }

  revalidateTag('motorbike-catalog')
  await Promise.all([
    deleteRedisKey(MOTORBIKE_CATALOG_CACHE_KEY),
    deleteRedisKeysByPrefix(MOTORBIKE_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({ success: true })
}
