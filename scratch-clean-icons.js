const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function run() {
  console.log('Loading assets.json and calculating sizes...');
  const assets = JSON.parse(fs.readFileSync('D:/data vinfast/vinfast-om/data/normalized/assets.json', 'utf8'));
  const sizeMap = new Map();
  
  for (const asset of assets) {
    if (asset.source_url && asset.relativePath) {
      try {
        const stats = fs.statSync('public' + asset.relativePath);
        sizeMap.set(asset.source_url, stats.size);
      } catch(e) {}
    }
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  console.log('Fetching all chunks with images...');
  let allRecords = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('manual_article_chunks')
      .select('id, image_url')
      .not('image_url', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
      
    if (error) {
      console.error('Error fetching data:', error);
      return;
    }
    if (!data || data.length === 0) break;
    allRecords.push(...data);
    page++;
  }
  
  console.log(`Found ${allRecords.length} chunks with images.`);
  
  const toNullify = [];
  for (const record of allRecords) {
    const size = sizeMap.get(record.image_url);
    // If size is < 10000 bytes (10KB), it's likely an icon
    if (size !== undefined && size < 10000) {
      toNullify.push(record.id);
    }
  }
  
  console.log(`Found ${toNullify.length} chunks with small icon images (<10KB). Nullifying...`);
  
  let updatedCount = 0;
  for (let i = 0; i < toNullify.length; i += 50) {
    const batch = toNullify.slice(i, i + 50);
    const { error } = await supabase
      .from('manual_article_chunks')
      .update({ image_url: null })
      .in('id', batch);
      
    if (error) {
      console.error('Error updating batch:', error.message);
    } else {
      updatedCount += batch.length;
    }
    console.log(`Progress: ${updatedCount} / ${toNullify.length}`);
  }
  
  console.log('Done! All small icons have been removed from the database.');
}

run().catch(console.error);
