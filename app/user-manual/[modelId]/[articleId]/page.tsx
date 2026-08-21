import { getManualArticle, getManualTree } from '@/lib/api/manuals-server'
import { notFound } from 'next/navigation'
import './manual.css' // We'll add some styles here
import { ArticleContent } from './article-content'
import { normalizeManualContentHtml } from '@/lib/api/manual-content'

export async function generateStaticParams({ params }: { params: { modelId: string } }) {
  const decodedModelId = decodeURIComponent(params.modelId)
  const tree = await getManualTree(decodedModelId)
  return tree.map(article => ({
    articleId: article.id
  }))
}

export async function generateMetadata({ params }: { params: Promise<{ modelId: string, articleId: string }> }) {
  const { modelId, articleId } = await params;
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
  params
}: {
  params: Promise<{ modelId: string, articleId: string }>
}) {
  const { modelId, articleId } = await params;
  const decodedModelId = decodeURIComponent(modelId)
  const decodedArticleId = decodeURIComponent(articleId)
  
  const article = await getManualArticle(decodedModelId, decodedArticleId)

  if (!article) {
    notFound()
  }

  // Basic string replace for Vinfast images if they are absolute. 
  // If they are relative, they might be broken unless we proxy or copy them.
  // The original images might be at `https://om.vinfastauto.com/vi_vn/...`
  // We'll just render the HTML as is, but if images are missing we'll know.
  const contentHtml = normalizeManualContentHtml(article.content_html || '')

  // Get search data (all articles for this model)
  const tree = await getManualTree(decodedModelId)
  const searchData = tree
    .filter(item => item.content_html && item.content_html.trim().length > 0)
    .map(item => ({ id: item.id, title: item.title }))

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
