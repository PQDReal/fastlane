

import { embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import {
  assertManualEmbeddingDimensions,
  MANUAL_EMBEDDING_MODEL,
  MANUAL_EMBEDDING_PROVIDER_OPTIONS,
} from './manual-embedding-config'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import * as cheerio from 'cheerio'
import fs from 'fs'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Load URL mapping for images
let urlMap: Record<string, string> = {}
try {
  const assetsData = JSON.parse(fs.readFileSync('D:\\data vinfast\\vinfast-om\\data\\normalized\\assets.json', 'utf8'))
  for (const asset of assetsData) {
    if (asset.relativePath && asset.source_url) {
      urlMap[asset.relativePath] = asset.source_url
    }
  }
} catch (err) {
  console.warn('Could not load assets.json mapping')
}

export type ManualRawChunk = {
  chunkIndex: number
  sectionTitle: string
  content: string
  imageUrl?: string
}

function parseManualHtml(html: string): ManualRawChunk[] {
  const chunks: ManualRawChunk[] = []
  const $ = cheerio.load(html)
  let chunkIndex = 0

  // Fallback if the HTML structure is complex:
  // A typical manual article might have headings and images
  // For MVP, we will extract text blocks. If there is an image followed by a table (like the overview),
  // we will try to group them.
  
  // Basic parsing logic (this will need to be refined based on the actual HTML structure from VinFast)
  const elements = $('h1, h2, h3, h4, h5, h6, p, li, img, table')
  let currentSectionTitle = 'Tổng quan'
  let currentTextPieces: string[] = []
  let currentImageUrl: string | undefined = undefined

  const flushChunk = () => {
    if (currentTextPieces.length > 0 || currentImageUrl) {
      chunks.push({
        chunkIndex,
        sectionTitle: currentSectionTitle,
        content: currentTextPieces.join('\n').trim(),
        imageUrl: currentImageUrl,
      })
      chunkIndex++
      currentTextPieces = []
      currentImageUrl = undefined
    }
  }

  elements.each((_, el) => {
    const tag = el.tagName.toLowerCase()
    const $el = $(el)

    const isHeading =
      /^h[1-6]$/.test(tag) ||
      $el.hasClass('Detail-Heading') ||
      $el.hasClass('Sub-Section') ||
      $el.hasClass('Sub-Sub-Heading')

    if (isHeading) {
      flushChunk()
      currentSectionTitle = $el.text().trim()
    } else if (tag === 'img') {
      // Only keep main images which are wrapped in <p class="Image"> in VinFast manuals
      if ($el.parent().hasClass('Image')) {
        const rawSrc = $el.attr('src')
        if (rawSrc) {
          if (!currentImageUrl) {
            if (urlMap[rawSrc]) {
              currentImageUrl = urlMap[rawSrc]
            } else if (rawSrc.startsWith('/')) {
              currentImageUrl = `https://om.vinfastauto.com${rawSrc}`
            } else {
              currentImageUrl = rawSrc
            }
          }
          flushChunk()
        }
      }
    } else if (tag === 'table') {
      // Extract table rows as annotations
      $el.find('tr').each((_, tr) => {
        const rowText = $(tr)
          .find('td, th')
          .map((_, cell) => $(cell).text().trim())
          .get()
          .join(': ')
        if (rowText) {
          currentTextPieces.push(rowText)
        }
      })
    } else {
      const text = $el.text().trim()
      if (text) {
        currentTextPieces.push(text)
      }
    }
  })

  flushChunk()

  // Filter out empty chunks
  return chunks.filter((c) => c.content.length > 0 || c.imageUrl)
}

export async function embedManualArticle(articleId: string): Promise<number> {
  const supabase = getSupabaseAdmin()

  // 1. Fetch the article
  const { data: article, error } = await supabase
    .from('manual_articles')
    .select('id, title, content_html')
    .eq('id', articleId)
    .single()

  if (error || !article || !article.content_html) {
    console.error(`Article ${articleId} not found or has no HTML content.`)
    return 0
  }

  // 2. Parse HTML into chunks
  const chunks = parseManualHtml(article.content_html)
  if (chunks.length === 0) return 0

  // 3. Generate embeddings
  const valuesToEmbed = chunks.map((c) => `Tiêu đề: ${article.title}\nPhần: ${c.sectionTitle}\nNội dung: ${c.content}`)
  
  const { embeddings } = await embedMany({
    model: openai.embedding(MANUAL_EMBEDDING_MODEL),
    values: valuesToEmbed,
    providerOptions: MANUAL_EMBEDDING_PROVIDER_OPTIONS,
  })
  embeddings.forEach(assertManualEmbeddingDimensions)

  // 4. Delete existing chunks for this article
  await supabase.from('manual_article_chunks').delete().eq('article_id', articleId)

  // 5. Insert new chunks
  const insertData = chunks.map((chunk, i) => ({
    article_id: articleId,
    chunk_index: chunk.chunkIndex,
    section_title: chunk.sectionTitle,
    content: chunk.content,
    image_url: chunk.imageUrl || null,
    embedding: `[${embeddings[i].slice(0, 512).join(',')}]`, // vector format
  }))

  const { error: insertError } = await supabase.from('manual_article_chunks').insert(insertData)
  
  if (insertError) {
    console.error('Failed to insert chunks:', insertError)
    throw new Error('Failed to insert manual chunks')
  }

  return chunks.length
}
