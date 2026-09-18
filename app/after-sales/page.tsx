import type { Metadata } from 'next'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { getAfterSalesData } from '@/lib/api/after-sales-server'
import { getManualModels } from '@/lib/api/manuals-server'
import { AfterSalesClient } from './after-sales-client'

export const metadata: Metadata = {
  title: 'Dịch vụ hậu mãi chính hãng | FASTLANE',
  description:
    'Chính sách bảo hành lên tới 10 năm, dịch vụ bảo dưỡng định kỳ, sửa chữa chuyên sâu, cứu hộ 24/7 và tra cứu sổ tay hướng dẫn sử dụng xe FASTLANE.',
}

export const revalidate = 300

export default async function AfterSalesPage() {
  const [afterSalesData, manualModels] = await Promise.all([
    getAfterSalesData(),
    getManualModels(),
  ])
  const initialData = { ...afterSalesData, workshops: [] }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc]">
      <Header />
      <main className="flex-1 pt-[74px]">
        <AfterSalesClient initialData={initialData} manualModels={manualModels} />
      </main>
      <Footer />
    </div>
  )
}
