import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomUUID } from 'node:crypto'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'
import { DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX, MOTORBIKE_CATALOG_CACHE_KEY, MOTORBIKE_DETAIL_CACHE_PREFIX, PRODUCT_SEARCH_CACHE_PREFIX } from '@/lib/cache-keys'
import { reconstructMotorbikeAdminConfiguration } from '@/lib/motorbike-admin-variants'
import { DEFAULT_MOTORBIKE_SPEC_FIELDS, mergeVehicleSpecFields, normalizeMotorbikeSpecFields } from '@/lib/vehicle-specifications'
import {
  buildMotorbikeVersionMedia,
  findMotorbikeVersionMedia,
  MAX_MOTORBIKE_DETAIL_IMAGES,
  MAX_MOTORBIKE_VERSION_DETAIL_IMAGES,
  normalizeMotorbikeDetailImages,
  normalizeMotorbikeVersionMedia,
} from '@/lib/motorbike-version-media'
import { resolveMotorbikeVariantColorMedia, type MotorbikeVariantColorMedia } from '@/lib/motorbike-variant-color-media'

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
    .select('product_variant_id,version,color,sku,price,deposit_amount,image_car_url,image_color_url')
    .eq('product_id', productId)
  if (vvError) {
    return NextResponse.json({ error: `Lỗi tải cấu hình xe: ${vvError.message}` }, { status: 500 })
  }

  // Reconstruct form state
  const specsObj = product.specifications || {}
  const versionMedia = normalizeMotorbikeVersionMedia(specsObj.version_media)
  const image_urls = product.image_urls || []
  
  const listing_image_url = specsObj.catalog?.listing_image_url || image_urls[0] || ''
  const hero_image_url = specsObj.catalog?.hero_image_url || image_urls[1] || ''
  const legacyDetailImages = Array.isArray(specsObj.detail_images)
    ? specsObj.detail_images
    : image_urls.slice(-3)
  const detail_image_urls = normalizeMotorbikeDetailImages(legacyDetailImages)
  const colorDetails = (Array.isArray(specsObj.color_details) ? specsObj.color_details : []).map((color: any) => ({
    ...color,
    // Older records stored the only swatch copy on vehicle_variants. Hydrate it
    // into the shared color record so the editor can migrate the product safely.
    swatch: String(color.swatch ?? '').trim()
      || String((vehicleVariants || []).find((variant: any) => variant.color === color.color_name)?.image_color_url ?? '').trim(),
  }))

  const reconstructedVersions = reconstructMotorbikeAdminConfiguration({
    productVariants: productVariants || [],
    vehicleVariants: vehicleVariants || [],
    inventoryByVariantId,
    declaredVersions: specsObj.variants,
    colors: colorDetails,
    productName: product.name,
  })

  const formState = {
    name: product.name,
    slug: product.slug,
    description: product.description || '',
    is_active: product.is_active,
    listing_image_url,
    hero_image_url,
    detail_image_urls,
    specifications: specsObj.specs || {},
    specification_fields: mergeVehicleSpecFields(
      normalizeMotorbikeSpecFields(specsObj.specification_fields),
      specsObj.specs,
      'Kích thước & Tiện ích',
      DEFAULT_MOTORBIKE_SPEC_FIELDS,
    ),
    colors: colorDetails,
    versions: reconstructedVersions.map((version) => {
      const media = findMotorbikeVersionMedia(versionMedia, version)
      const mediaByColor = Object.fromEntries(
        (vehicleVariants || [])
          .filter((variant: any) => variant.sku?.replace(/-C\d{2}$/i, '') === version.sku || variant.version === version.name)
          .map((variant: any) => {
            const fallbackColor = colorDetails.find((color: any) => color.color_name === variant.color)
            return [variant.color, {
              image_url: variant.image_car_url || fallbackColor?.image_url || '',
              swatch: fallbackColor?.swatch || variant.image_color_url || '',
            }]
          }),
      )
      return {
        ...version,
        image_url: media?.image_url || '',
        detail_image_urls: media?.detail_image_urls || [],
        media_by_color: mediaByColor,
      }
    }),
    advanced_color_price: Number(product.advanced_color_price || 0),
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
    detail_image_urls: rawDetailImageUrls = [],
    specifications = {},
    specification_fields = undefined,
    colors = [],
    advanced_color_price = 0,
    versions = [],
    landing_page_blocks = [],
  } = body
  const detail_image_urls = normalizeMotorbikeDetailImages(rawDetailImageUrls)

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
  const configurationSignatures = sellableConfigurations.map(
    ({ version, color }: any) => `${version.sku}\u001f${color.color_name}`,
  )
  if (sellableConfigurations.length === 0 || new Set(configurationSignatures).size !== configurationSignatures.length) {
    return NextResponse.json({ error: 'Các cặp phiên bản và màu phải hợp lệ, không trùng nhau.' }, { status: 400 })
  }
  if (sellableConfigurations.some(({ version, color }: any) => {
    const value = Number(version.stock_by_color?.[color.color_name] ?? 0)
    return !Number.isInteger(value) || value < 0
  })) {
    return NextResponse.json({ error: 'Tồn kho của từng cấu hình phải là số nguyên không âm.' }, { status: 400 })
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

  const categoryId = '6dfde2e5-b9d5-755c-10db-19a7ce6c24b5'

  // Format specifications
  const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
  const priceStr = versions.map((v: any) => `${v.name}: ${priceFormatter.format(v.price)}`).join(' / ')

  const image_urls = Array.from(new Set([
    listing_image_url,
    hero_image_url,
    ...colorMediaForConfigurations.flatMap((media) => [media.image_url, media.swatch]),
    ...versionMedia.flatMap((media) => [media.image_url, ...media.detail_image_urls]),
    ...detail_image_urls,
  ].filter(Boolean)))

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
  const { data: existingPV } = await supabase.from('product_variants').select('id, sku').eq('product_id', productId)
  const pvMap = new Map(existingPV?.map((r) => [r.sku, r.id]) || [])

  const { data: existingVV } = await supabase.from('vehicle_variants').select('id, sku').eq('product_id', productId)
  const vvMap = new Map(existingVV?.map((r) => [r.sku, r.id]) || [])

  // 3. Form new rows
  const productVariantRows = sellableConfigurations.map(({ version, color: colorItem, colorIndex }: any, rowIndex: number) => {
      const sku = `${version.sku}-C${String(colorIndex + 1).padStart(2, '0')}`
      return {
        id: pvMap.get(sku) || randomUUID(),
        product_id: productId,
        sku,
        name: `${version.name} - ${colorItem.color_name}`,
        original_price: priceForConfiguration(version, colorItem),
        sale_price: null,
        is_active: is_active,
        option_signature: `version=${version.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}&color=${String(colorItem.color_name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        metadata: {
          source: 'admin_motorbike_edit',
          base_sku: version.sku,
          version: version.name,
          color: colorItem.color_name,
          color_image_url: colorMediaForConfigurations[rowIndex].image_url,
          color_swatch_url: colorMediaForConfigurations[rowIndex].swatch,
          version_image_url: findMotorbikeVersionMedia(versionMedia, version)?.image_url || null,
          version_detail_image_urls: findMotorbikeVersionMedia(versionMedia, version)?.detail_image_urls || [],
        },
        deposit_amount: version.deposit_amount,
      }
    })

  const vehicleVariantRows: any[] = []
  const generatedAt = new Date().toISOString()

  productVariantRows.forEach((variantRow: any, rowIndex: number) => {
      const { versionIndex, colorIndex, version: originalVersion, color: colorItem } = sellableConfigurations[rowIndex]
      const sku = variantRow.sku
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
          hero_image_url,
          version_image_url: findMotorbikeVersionMedia(versionMedia, originalVersion)?.image_url || '',
          original_price: Number(variantRow.original_price),
          detail_image_urls: detail_image_urls,
          version_detail_image_urls: findMotorbikeVersionMedia(versionMedia, originalVersion)?.detail_image_urls || [],
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
        color_type: colorItem.color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
        color_price_adjustment: colorItem.color_type === 'ADVANCED' ? advancedColorPrice : 0,
        image_car_url: colorMediaForConfigurations[rowIndex].image_url,
        image_color_url: colorMediaForConfigurations[rowIndex].swatch,
        version: originalVersion.name,
        is_active: is_active,
        product_variant_id: variantRow.id,
      })
  })

  // 4. Perform deletions
  const newPvSkus = productVariantRows.map((r: any) => r.sku)
  const existingPvSkus = existingPV?.map((r) => r.sku) || []
  const pvSkusToDelete = existingPvSkus.filter((s) => !newPvSkus.includes(s))

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

  if (pvSkusToDelete.length > 0) {
    const variantsToDelete = (existingPV || []).filter((row) => pvSkusToDelete.includes(row.sku))
    const idsToDelete = variantsToDelete.map((row) => row.id)
    if (idsToDelete.length > 0) {
      await supabase.from('inventory_items').delete().in('variant_id', idsToDelete)
      await supabase.from('cart_items').delete().in('variant_id', idsToDelete)
      await supabase.from('product_media').delete().in('variant_id', idsToDelete)
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

  const mappedVehicleRows = vehicleVariantRows
  const inventoryRows = productVariantRows.map((row: any, rowIndex: number) => ({
    variant_id: row.id,
    on_hand_quantity: Number(
      sellableConfigurations[rowIndex].version.stock_by_color?.[
        sellableConfigurations[rowIndex].color.color_name
      ] ?? 0,
    ),
    updated_at: new Date().toISOString(),
  }))
  const { error: inventoryUpsertError } = await supabase
    .from('inventory_items')
    .upsert(inventoryRows, { onConflict: 'variant_id' })
  if (inventoryUpsertError) {
    return NextResponse.json({ error: `Lỗi lưu tồn kho: ${inventoryUpsertError.message}` }, { status: 500 })
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
    deleteRedisKeysByPrefix(DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({ success: true })
}
