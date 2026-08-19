import { getManualArticle, getManualTree } from '@/lib/api/manuals-server'
import { notFound } from 'next/navigation'
import './manual.css'
import { ArticleContent } from './article-content'

export async function generateStaticParams({
  params,
}: {
  params: { modelId: string }
}) {
  const decodedModelId = decodeURIComponent(params.modelId)
  const tree = await getManualTree(decodedModelId)
  return tree.map((article) => ({
    articleId: article.id,
  }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ modelId: string; articleId: string }>
}) {
  const { modelId, articleId } = await params
  const decodedModelId = decodeURIComponent(modelId)
  const decodedArticleId = decodeURIComponent(articleId)
  const article = await getManualArticle(decodedModelId, decodedArticleId)

  if (!article) return { title: 'Không tìm thấy - FASTLANE' }

  return {
    title: `${article.title} - FASTLANE`,
    description: `Hướng dẫn sử dụng VinFast: ${article.title}`,
  }
}

export default async function ManualArticlePage({
  params,
}: {
  params: Promise<{ modelId: string; articleId: string }>
}) {
  const { modelId, articleId } = await params
  const decodedModelId = decodeURIComponent(modelId)
  const decodedArticleId = decodeURIComponent(articleId)

  const article = await getManualArticle(decodedModelId, decodedArticleId)

  if (!article) {
    notFound()
  }

  const contentHtml = article.content_html || ''

  // Get search data (all articles for this model)
  const tree = await getManualTree(decodedModelId)
  const searchData = tree
    .filter((item) => item.content_html && item.content_html.trim().length > 0)
    .map((item) => ({ id: item.id, title: item.title }))

  return (
    <article className="w-full p-6 md:p-8 lg:p-10 pb-24 vf-manual-content">
      <ArticleContent
        contentHtml={contentHtml}
        modelId={decodedModelId}
        articleTitle={article.title}
        searchData={searchData}
      />
    </article>
  )
}
