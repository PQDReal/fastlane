import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { listAccessoryCatalog } from '../../lib/catalog/server'
import { AccessoryCatalogBrowser } from './accessory-catalog-browser'

export const dynamic = 'force-dynamic'

export default async function AccessoriesPage() {
  const catalogPage = await listAccessoryCatalog({
    page: 1,
    pageSize: 100,
  })

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />

      <header className="border-b border-slate-200/80 bg-white shadow-xs">
        <div className="mx-auto max-w-[1440px] px-6 py-6 lg:px-12 lg:py-7">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Link href="/" className="transition hover:text-brand-600">Trang chủ</Link>
            <ChevronRight size={13} />
            <span className="font-semibold text-slate-700">Phụ kiện</span>
          </nav>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
                Phụ kiện Chính Hãng VinFast
              </h1>
            </div>
            <p className="max-w-md text-xs leading-5 text-slate-500 sm:text-right sm:text-sm">
              Tìm theo tên sản phẩm hoặc thu hẹp kết quả theo danh mục và dòng xe phù hợp.
            </p>
          </div>
        </div>
      </header>

      <AccessoryCatalogBrowser products={catalogPage.products} />

      <Footer />
    </main>
  )
}
