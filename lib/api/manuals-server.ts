import { cache } from 'react'
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
  content_html: string | null
  content_text: string | null
  thumbnail: string | null
  sort_order: number
}

export const getManualModels = cache(async (): Promise<ManualModel[]> => {
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
})

export const getManualTree = cache(async (modelId: string): Promise<ManualArticle[]> => {
  if (!hasSupabaseConfig()) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_articles')
    .select('*')
    .eq('model_id', modelId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching manual tree from DB:', error)
    return []
  }

  return data as ManualArticle[]
})

export const getManualArticle = cache(async (modelId: string, articleId: string): Promise<ManualArticle | undefined> => {
  if (!hasSupabaseConfig()) return undefined
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_articles')
    .select('*')
    .eq('model_id', modelId)
    .eq('id', articleId.includes('_') ? articleId : `${modelId}_${articleId}`)
    .single()

  if (error) {
    console.error('Error fetching manual article from DB:', error)
    return undefined
  }

  return data as ManualArticle
})

// Used to get the first article (like "Introduction") to redirect or show by default
export const getFirstArticleId = cache(async (modelId: string): Promise<string | undefined> => {
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
})
