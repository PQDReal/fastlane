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

      <AccessoryCatalogBrowser products={catalogPage.products} />

      <Footer />
    </main>
  )
}
