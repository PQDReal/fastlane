import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { AccessoryCard } from '../../components/accessory-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getSupabaseAdmin } from '../../lib/supabase-admin'

import { Pagination } from '../../components/pagination'
import type { AccessoryCatalogProduct } from '../../lib/cart/types'

export const dynamic = 'force-dynamic'

const categories = ["Tất cả", "Sạc & Cáp", "Nội thất", "Ngoại thất", "Đồ dã ngoại", "Quần áo thời trang"]

export default async function AccessoriesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams
  const currentPage = parseInt(params.page || '1', 10)
  const pageSize = 12
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize - 1

  const supabase = getSupabaseAdmin()
  const { data: rawAccessories, count } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      image_urls,
      specifications,
      category:categories!inner(name),
      product_variants!inner(
        id,
        sku,
        name,
        original_price,
        sale_price,
        is_active,
        inventory_items(on_hand_quantity)
      )
    `, { count: 'exact' })
    .eq('is_active', true)
    .eq('product_type', 'ACCESSORY')
    .eq('categories.name', 'Phụ kiện')
    .eq('product_variants.is_active', true)
    .range(start, end)
  
  const accessoriesData = rawAccessories || []
  const totalPages = count ? Math.ceil(count / pageSize) : 1

  const accessories: AccessoryCatalogProduct[] = accessoriesData.map((product) => {
    const image = Array.isArray(product.image_urls)
      && typeof product.image_urls[0] === 'string'
      && product.image_urls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i)
      ? product.image_urls[0]
      : '/images/vf8.png'
    const specifications = product.specifications
      && typeof product.specifications === 'object'
      && !Array.isArray(product.specifications)
      ? product.specifications as Record<string, unknown>
      : {}
    const sourceVariants = Array.isArray(specifications.variants) ? specifications.variants : []
    const sourceBySku = new Map(sourceVariants.map((variant: any) => [
      String(variant.sku || variant.variant_id).toUpperCase(),
      variant,
    ]))

    const variants = (product.product_variants || []).map((variant) => {
      const listPrice = Number(variant.original_price)
      const salePrice = variant.sale_price === null ? null : Number(variant.sale_price)
      const priceAmount = salePrice ?? listPrice
      const inventory = Array.isArray(variant.inventory_items)
        ? variant.inventory_items[0]
        : variant.inventory_items
      const sourceVariant: any = sourceBySku.get(String(variant.sku).toUpperCase())
      const variantImage = sourceVariant?.image || sourceVariant?.images?.[0] || image
      const attributes = sourceVariant?.attributes
        && typeof sourceVariant.attributes === 'object'
        && !Array.isArray(sourceVariant.attributes)
        ? sourceVariant.attributes as Record<string, string>
        : {}

      return {
        productId: product.id,
        productSlug: product.slug,
        variantId: variant.id,
        sku: variant.sku,
        variantName: variant.name,
        name: variant.name === 'Mặc định'
          ? product.name
          : `${product.name} - ${variant.name}`,
        priceAmount,
        oldPriceAmount: salePrice !== null && salePrice < listPrice ? listPrice : null,
        discount: salePrice !== null && salePrice < listPrice
          ? Math.round((1 - salePrice / listPrice) * 100)
          : null,
        image: variantImage,
        attributes,
        availableQuantity: Math.max(0, Number(inventory?.on_hand_quantity ?? 0)),
      }
    })

    return {
      productId: product.id,
      productSlug: product.slug,
      name: product.name,
      image,
      variants,
    }
  })

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />
      
      <div className="bg-muted py-20 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Phụ kiện chính hãng</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Phụ kiện chính hãng</h1>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
            Cá nhân hóa chiếc xe của bạn với bộ sưu tập phụ kiện cao cấp, được thiết kế độc quyền cho các dòng xe Fastlane.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 py-12 w-full flex flex-col md:flex-row gap-12">
        {/* Sidebar Filters */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="sticky top-[100px]">
            <h3 className="text-lg font-bold text-foreground mb-6 tracking-tight">Danh mục</h3>
            <ul className="space-y-3">
              {categories.map((cat, i) => (
                <li key={i}>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" className="w-4 h-4 rounded border-muted-foreground/30 text-brand-600 focus:ring-brand-500 accent-foreground cursor-pointer" defaultChecked={i === 0} />
                    <span className={`text-sm font-medium transition-colors group-hover:text-foreground ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{cat}</span>
                  </label>
                </li>
              ))}
            </ul>

            <h3 className="text-lg font-bold text-foreground mt-10 mb-6 tracking-tight">Khoảng giá</h3>
            <div className="space-y-4">
              <input type="range" min="0" max="20000000" className="w-full accent-foreground" />
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>0 ₫</span>
                <span>20.000.000 ₫</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
            <div className="relative w-full sm:w-[350px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input type="text" placeholder="Tìm kiếm phụ kiện..." className="w-full h-11 pl-11 pr-4 rounded-full border border-muted bg-background focus:outline-none focus:border-brand-500 transition-colors text-sm" />
            </div>
            
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground font-medium hidden lg:inline">Hiển thị {accessories.length} kết quả</span>
              <select className="h-11 px-4 rounded-full border border-muted bg-background text-sm font-medium focus:outline-none focus:border-brand-500">
                <option>Mới nhất</option>
                <option>Giá: Thấp đến cao</option>
                <option>Giá: Cao đến thấp</option>
                <option>Bán chạy nhất</option>
              </select>
            </div>
          </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {accessories.map((item) => (
                 <AccessoryCard key={item.productId} product={item} />
              ))}
            </div>
            
            <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/accessories" />
          </div>
      </div>

      <Footer />
    </main>
  )
}
