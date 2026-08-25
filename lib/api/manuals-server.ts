import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export interface ManualModel {
  id: string
  name: string
  category: string | null
  thumbnail: string | null
  model_series: string
  year: string
  sort_order: number
}

export interface ManualArticle {
  id: string
  original_id: number | null
  model_id: string
  parent_id: string | null
  title: string
  slug: string
  level: number
  content_html?: string | null
  content_text?: string | null
  thumbnail?: string | null
  sort_order: number
}

export interface ManualSearchItem {
  id: string
  title: string
}

const getManualModelsCached = unstable_cache(async (): Promise<ManualModel[]> => {
  if (!hasSupabaseConfig()) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_models')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching manual models from DB:', JSON.stringify(error))
    return []
  }

  return data as ManualModel[]
}, ['manual-models-v1'], { revalidate: 300, tags: ['manual-content'] })

export const getManualModels = cache(getManualModelsCached)

const getManualModelCached = unstable_cache(async (modelId: string): Promise<ManualModel | undefined> => {
  if (!hasSupabaseConfig()) return undefined
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('manual_models').select('*').eq('id', modelId).maybeSingle()

  if (error) {
    console.error('Error fetching manual model from DB:', JSON.stringify(error))
    return undefined
  }

  return (data as ManualModel | null) ?? undefined
}, ['manual-model-v1'], { revalidate: 300, tags: ['manual-content'] })

export const getManualModel = cache(getManualModelCached)

const getManualTreeCached = unstable_cache(async (modelId: string): Promise<ManualArticle[]> => {
  if (!hasSupabaseConfig()) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_articles')
    .select('id, original_id, model_id, parent_id, title, slug, level, sort_order')
    .eq('model_id', modelId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching manual tree from DB:', error)
    return []
  }

  return data as ManualArticle[]
}, ['manual-tree-v1'], { revalidate: 300, tags: ['manual-content'] })

export const getManualTree = cache(getManualTreeCached)

// Keep the navigation tree lightweight while still providing the article-level
// search that the manual reader had before the tree query was optimized.
const getManualSearchIndexCached = unstable_cache(async (modelId: string): Promise<ManualSearchItem[]> => {
  if (!hasSupabaseConfig()) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_articles')
    .select('id, title')
    .eq('model_id', modelId)
    .not('content_html', 'is', null)
    .neq('content_html', '')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching manual search index from DB:', error)
    return []
  }

  return data as ManualSearchItem[]
}, ['manual-search-index-v1'], { revalidate: 300, tags: ['manual-content'] })

export const getManualSearchIndex = cache(getManualSearchIndexCached)

const getManualArticleCached = unstable_cache(async (modelId: string, articleId: string): Promise<ManualArticle | undefined> => {
  if (!hasSupabaseConfig()) return undefined
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_articles')
    .select('*')
    .eq('model_id', modelId)
    .eq('id', articleId.includes('_') ? articleId : `${modelId}_${articleId}`)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined // Not found, no need to spam logs
    }
    console.error('Error fetching manual article from DB:', error)
    return undefined
  }

  return data as ManualArticle
}, ['manual-article-v1'], { revalidate: 300, tags: ['manual-content'] })

export const getManualArticle = cache(getManualArticleCached)

// Used to get the first article (like "Introduction") to redirect or show by default
const getFirstArticleIdCached = unstable_cache(async (modelId: string): Promise<string | undefined> => {
  if (!hasSupabaseConfig()) return undefined
  const supabase = getSupabaseAdmin()
  const { data: items, error } = await supabase
    .from('manual_articles')
    .select('id, parent_id, level, sort_order')
    .eq('model_id', modelId)

  if (error || !items || items.length === 0) return undefined
  
  // Build a map of parent -> children
  const childrenMap = new Map<string, any[]>()
  for (const item of items) {
    if (item.parent_id) {
      if (!childrenMap.has(item.parent_id)) childrenMap.set(item.parent_id, [])
      childrenMap.get(item.parent_id)!.push(item)
    }
  }

  // Sort children
  for (const [_, children] of childrenMap.entries()) {
    children.sort((a, b) => a.sort_order - b.sort_order)
  }

  // Find root nodes
  const roots = items.filter(item => !item.parent_id || item.level === 1)
  roots.sort((a, b) => a.sort_order - b.sort_order)

  // DFS to find first leaf
  const findFirstLeaf = (nodes: any[]): string | undefined => {
    for (const node of nodes) {
      const children = childrenMap.get(node.id)
      if (children && children.length > 0) {
        const leaf = findFirstLeaf(children)
        if (leaf) return leaf
      } else {
        return node.id
      }
    }
    return undefined
  }

  return findFirstLeaf(roots)
}, ['manual-first-article-v1'], { revalidate: 300, tags: ['manual-content'] })

export const getFirstArticleId = cache(getFirstArticleIdCached)
