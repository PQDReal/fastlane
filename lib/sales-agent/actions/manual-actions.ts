'use server'

import { getManualArticle, getManualTree } from '@/lib/api/manuals-server'

export async function fetchManualArticleAction(modelId: string, articleId: string) {
  try {
    const decodedModelId = decodeURIComponent(modelId)
    const decodedArticleId = decodeURIComponent(articleId)
    
    const article = await getManualArticle(decodedModelId, decodedArticleId)
    if (!article) return null

    // Get search data (all articles for this model)
    const tree = await getManualTree(decodedModelId)
    const searchData = tree
      .filter(item => item.content_html && item.content_html.trim().length > 0)
      .map(item => ({ id: item.id, title: item.title }))

    return {
      contentHtml: article.content_html || '',
      articleTitle: article.title,
      searchData
    }
  } catch (err) {
    console.error('fetchManualArticleAction failed:', err)
    return null
  }
}
