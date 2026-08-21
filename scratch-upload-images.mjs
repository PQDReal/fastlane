import { createClient } from '@supabase/supabase-js'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const rawUrl = (process.env.CLOUDINARY_URL || '').replace(/\r$/, '')
// Expected format: cloudinary://api_key:api_secret@cloud_name
const match = rawUrl.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/)
if (match) {
  cloudinary.config({
    cloud_name: match[3],
    api_key: match[1],
    api_secret: match[2]
  })
} else {
  console.error("Invalid CLOUDINARY_URL format.")
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  console.log('Fetching unique images from Supabase (paginated)...')
  let allRecords = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('manual_article_chunks')
      .select('image_url')
      .like('image_url', '/assets/%')
      .range(page * 1000, (page + 1) * 1000 - 1)
      
    if (error) {
      console.error('Error fetching data:', error)
      return
    }
    if (!data || data.length === 0) break
    allRecords.push(...data)
    page++
  }

  const uniqueLocalImages = [...new Set(allRecords.map(d => d.image_url))]
  console.log(`Found ${uniqueLocalImages.length} unique local images.`)

  const urlMap = {}

  const batchSize = 20
  for (let i = 0; i < uniqueLocalImages.length; i += batchSize) {
    const batch = uniqueLocalImages.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(uniqueLocalImages.length / batchSize)}`)
    
    await Promise.all(batch.map(async (localUrl) => {
      const absolutePath = path.join(process.cwd(), 'public', localUrl)
      if (!fs.existsSync(absolutePath)) {
        console.warn(`File not found: ${absolutePath}`)
        return
      }
      try {
        const result = await cloudinary.uploader.upload(absolutePath, { folder: 'fastlane_manuals' })
        urlMap[localUrl] = result.secure_url
      } catch (err) {
        console.error(`Error uploading ${localUrl}:`, err.message)
      }
    }))
  }

  console.log('Updating database...')
  let updatedCount = 0
  const urlEntries = Object.entries(urlMap)
  for (let i = 0; i < urlEntries.length; i += 50) {
    const batch = urlEntries.slice(i, i + 50)
    await Promise.all(batch.map(async ([localUrl, remoteUrl]) => {
      const { error: updateError } = await supabase
        .from('manual_article_chunks')
        .update({ image_url: remoteUrl })
        .eq('image_url', localUrl)
      if (updateError) {
        console.error(`Error updating ${localUrl}:`, updateError.message)
      } else {
        updatedCount++
      }
    }))
  }
  
  console.log(`Done. Uploaded and updated ${updatedCount} distinct image URLs.`)
}

run()
