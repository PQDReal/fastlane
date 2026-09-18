import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  console.log('Fetching Cloudinary URLs from Supabase...')
  let cloudinaryRecords = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('manual_article_chunks')
      .select('image_url')
      .like('image_url', 'https://res.cloudinary.com/%')
      .range(page * 1000, (page + 1) * 1000 - 1)
      
    if (error) {
      console.error('Error fetching data:', error)
      return
    }
    if (!data || data.length === 0) break
    cloudinaryRecords.push(...data)
    page++
  }

  const uniqueCloudinaryUrls = [...new Set(cloudinaryRecords.map(d => d.image_url))]
  console.log(`Found ${uniqueCloudinaryUrls.length} unique Cloudinary URLs.`)
  if (uniqueCloudinaryUrls.length === 0) {
    console.log('No Cloudinary URLs to process.')
    return
  }

  console.log('Computing MD5 hashes for local files (this might take a few seconds)...')
  const files = fs.readdirSync('public/assets/images/')
  const localMd5Map = {}
  for (const file of files) {
    if (!file.endsWith('.png') && !file.endsWith('.jpg')) continue
    const data = fs.readFileSync(path.join('public/assets/images', file))
    const md5 = crypto.createHash('md5').update(data).digest('hex')
    localMd5Map[md5] = `/assets/images/${file}`
  }
  console.log(`Computed MD5 for ${Object.keys(localMd5Map).length} local files.`)

  console.log('Loading assets.json...')
  const assetsData = JSON.parse(fs.readFileSync('D:\\data vinfast\\vinfast-om\\data\\normalized\\assets.json', 'utf8'))
  const urlMap = {}
  for (const asset of assetsData) {
    if (asset.relativePath && asset.source_url) {
      urlMap[asset.relativePath] = asset.source_url
    }
  }

  console.log('Downloading Cloudinary images and matching...')
  let updatedCount = 0
  let noMatchCount = 0

  for (let i = 0; i < uniqueCloudinaryUrls.length; i += 20) {
    const batch = uniqueCloudinaryUrls.slice(i, i + 20)
    
    await Promise.all(batch.map(async (remoteUrl) => {
      try {
        const res = await fetch(remoteUrl)
        const buffer = Buffer.from(await res.arrayBuffer())
        const md5 = crypto.createHash('md5').update(buffer).digest('hex')
        
        const localPath = localMd5Map[md5]
        if (!localPath) {
          console.warn(`No local file match for MD5 ${md5} (URL: ${remoteUrl})`)
          noMatchCount++
          return
        }
        
        const sourceUrl = urlMap[localPath]
        if (!sourceUrl) {
          console.warn(`No Vinfast source_url found for local path ${localPath}`)
          noMatchCount++
          return
        }
        
        // Update database
        const { error: updateError } = await supabase
          .from('manual_article_chunks')
          .update({ image_url: sourceUrl })
          .eq('image_url', remoteUrl)
          
        if (updateError) {
          console.error(`Error updating ${remoteUrl}:`, updateError.message)
        } else {
          updatedCount++
        }
      } catch (err) {
        console.error(`Error processing ${remoteUrl}:`, err.message)
      }
    }))
    
    console.log(`Progress: ${Math.min(i + 20, uniqueCloudinaryUrls.length)} / ${uniqueCloudinaryUrls.length}`)
  }

  console.log(`Done. Updated ${updatedCount} URLs. Failed/No match: ${noMatchCount}`)
}

run().catch(console.error)
