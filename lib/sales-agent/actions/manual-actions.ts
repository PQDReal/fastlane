'use server'

import { getManualArticle, getManualModel, getManualSearchIndex } from '@/lib/api/manuals-server'

export async function fetchManualArticleAction(modelId: string, articleId: string) {
  try {
    const decodedModelId = decodeURIComponent(modelId)
    const decodedArticleId = decodeURIComponent(articleId)
    
    const [article, model, searchData] = await Promise.all([
      getManualArticle(decodedModelId, decodedArticleId),
      getManualModel(decodedModelId),
      getManualSearchIndex(decodedModelId),
    ])
    if (!article || !model) return null

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
