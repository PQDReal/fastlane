import { getFirstArticleId, getManualModels } from '@/lib/api/manuals-server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export async function generateStaticParams() {
  const models = await getManualModels()
  return models.map(m => ({ modelId: m.id }))
}

export default async function ModelManualIndexPage(
  props: {
    params: Promise<{ modelId: string }>
  }
) {
  const params = await props.params;
  const decodedModelId = decodeURIComponent(params.modelId)
  const firstArticleId = await getFirstArticleId(decodedModelId)

  if (firstArticleId) {
    redirect(`/user-manual/${params.modelId}/${encodeURIComponent(firstArticleId)}`)
  }

  const models = await getManualModels()
  const model = models.find(m => m.id === decodedModelId)

  if (!model) {
    notFound()
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Hướng dẫn sử dụng {model.name}</h1>
      <p>Chọn một mục từ danh sách bên trái để bắt đầu đọc.</p>
    </div>
  )
}
