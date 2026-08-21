'use server'

import { getManualArticle, getManualModel, getManualTree } from '@/lib/api/manuals-server'

export async function fetchManualArticleAction(modelId: string, articleId: string) {
  try {
    const decodedModelId = decodeURIComponent(modelId)
    const decodedArticleId = decodeURIComponent(articleId)
    
    const [article, model, tree] = await Promise.all([
      getManualArticle(decodedModelId, decodedArticleId),
      getManualModel(decodedModelId),
      getManualTree(decodedModelId),
    ])
    if (!article || !model) return null

    // Get search data (all articles for this model)
    const searchData = tree
      .filter(item => item.content_html && item.content_html.trim().length > 0)
      .map(item => ({ id: item.id, title: item.title }))

    return {
      contentHtml: article.content_html || '',
      modelName: model.model_series || model.name,
      modelYear: model.year,
      articleTitle: article.title,
      searchData
    }
  } catch (err) {
    console.error('fetchManualArticleAction failed:', err)
    return null
  }
}
