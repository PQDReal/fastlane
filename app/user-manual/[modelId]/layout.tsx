import { getManualModels, getManualTree } from '@/lib/api/manuals-server'
import { ManualSidebar } from './manual-sidebar'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const models = await getManualModels()
    return models.map((m) => ({ modelId: m.id }))
  } catch (error) {
    console.error('Failed to generate static params in layout:', error)
    return []
  }
}

export default async function ModelManualLayout(props: {
  children: React.ReactNode
  params: Promise<{ modelId: string }>
}) {
  const params = await props.params
  const { children } = props
  const decodedModelId = decodeURIComponent(params.modelId)
  const models = await getManualModels()
  const model = models.find((m) => m.id === decodedModelId)

  if (!model) {
    notFound()
  }

  const tree = await getManualTree(decodedModelId)

  return (
    <div className="flex flex-col md:flex-row w-full flex-1">
      {/* Mobile Header / Sidebar */}
      <ManualSidebar tree={tree} modelId={decodedModelId} />

      {/* Content Area */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">{children}</div>
    </div>
  )
}
