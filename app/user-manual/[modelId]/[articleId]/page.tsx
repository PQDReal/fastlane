import { getManualArticle, getManualModel, getManualTree } from '@/lib/api/manuals-server'
import { notFound } from 'next/navigation'
import './manual.css'
import { ArticleContent } from './article-content'
import { normalizeManualContentHtml } from '@/lib/api/manual-content'

export async function generateStaticParams(props: { params: any }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const params = await props.params
    const decodedModelId = decodeURIComponent(params.modelId)
    const tree = await getManualTree(decodedModelId)
    return tree.map((article: any) => ({
      articleId: article.id,
    }))
  } catch (error) {
    console.error('Failed to generate static params:', error)
    return []
  }
}

export async function generateMetadata(props: {
  params: Promise<{ modelId: string; articleId: string }>
}) {
  const params = await props.params
  const decodedModelId = decodeURIComponent(params.modelId)
  const decodedArticleId = decodeURIComponent(params.articleId)
  const [article, model] = await Promise.all([
    getManualArticle(decodedModelId, decodedArticleId),
    getManualModel(decodedModelId),
  ])

  if (!article) return { title: 'Không tìm thấy - FASTLANE' }

  const modelLabel = model ? `${model.model_series || model.name} ${model.year}` : decodedModelId

  return {
    title: `${article.title} | ${modelLabel} - FASTLANE`,
    description: `Hướng dẫn sử dụng ${modelLabel}: ${article.title}`,
  }
}

export default async function ManualArticlePage(props: {
  params: Promise<{ modelId: string; articleId: string }>
}) {
  const params = await props.params
  const decodedModelId = decodeURIComponent(params.modelId)
  const decodedArticleId = decodeURIComponent(params.articleId)

  const [article, model, tree] = await Promise.all([
    getManualArticle(decodedModelId, decodedArticleId),
    getManualModel(decodedModelId),
    getManualTree(decodedModelId),
  ])

  if (!article || !model) {
    notFound()
  }

  // Basic string replace for Vinfast images if they are absolute. 
  // If they are relative, they might be broken unless we proxy or copy them.
  // The original images might be at `https://om.vinfastauto.com/vi_vn/...`
  // We'll just render the HTML as is, but if images are missing we'll know.
  const contentHtml = normalizeManualContentHtml(article.content_html || '')

  // Get search data (all articles for this model)
  const searchData = tree
    .filter((item) => item.content_html && item.content_html.trim().length > 0)
    .map((item) => ({ id: item.id, title: item.title }))

  return (
    <article className="w-full p-6 md:p-8 lg:p-10 pb-24 vf-manual-content">
      <ArticleContent
        contentHtml={contentHtml}
        modelId={decodedModelId}
        modelName={model.model_series || model.name}
        modelYear={model.year}
        articleTitle={article.title}
        searchData={searchData}
      />
    </article>
  )
}
