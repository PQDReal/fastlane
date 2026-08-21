import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// We need the service role key to bypass RLS for inserting.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = 'REDACTED_PUBLIC_HISTORY'; // From test-db.mjs

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_FILE = path.join(process.cwd(), 'public', 'data', 'by_type', 'vf_manual_articles.json');

async function seed() {
  console.log('Reading data from', DATA_FILE);
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  
  const VEHICLES_FILE = path.join(process.cwd(), 'public', 'data', 'by_type', 'manual_vehicles.json');
  const vehiclesData = JSON.parse(fs.readFileSync(VEHICLES_FILE, 'utf8')).data;
  
  // Create a mapping from model_code to category and thumbnail
  const modelInfoMap = new Map();
  for (const [category, categoryModels] of Object.entries(vehiclesData.models || {})) {
    for (const m of categoryModels) {
      modelInfoMap.set(m.model_code, { category, thumbnail: m.thumbnail });
    }
  }

  // Extract unique models
  const modelsMap = new Map();
  for (const item of data) {
    if (item.model_id) {
      if (!modelsMap.has(item.model_id)) {
        // e.g. "VF 3_2024"
        const parts = item.model_id.split('_');
        const modelSeries = parts[0];
        const info = modelInfoMap.get(modelSeries) || { category: '', thumbnail: '' };
        
        modelsMap.set(item.model_id, {
          id: item.model_id,
          name: item.model_id.replace('_', ' '),
          category: info.category,
          thumbnail: info.thumbnail,
          model_series: modelSeries,
          year: parts[1] || '',
          sort_order: 0
        });
      }
    }
  }

  const models = Array.from(modelsMap.values());
  console.log(`Found ${models.length} models to insert.`);

  const { error: modelsError } = await supabase.from('manual_models').upsert(models);
  if (modelsError) {
    console.error('Error inserting models:', modelsError);
    return;
  }
  
  console.log('Inserted models successfully.');

  // Insert articles in batches to avoid payload too large
  console.log(`Preparing to insert ${data.length} articles.`);
  const batchSize = 100;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize).map(a => ({
      id: a.id,
      original_id: a.original_id,
      model_id: a.model_id,
      parent_id: a.parent_id,
      title: a.title,
      slug: a.slug,
      level: a.level,
      content_html: a.content_html || '',
      content_text: a.content_text || '',
      thumbnail: a.thumbnail,
      sort_order: a.sort_order || 0
    }));

    const { error: batchError } = await supabase.from('manual_articles').upsert(batch);
    if (batchError) {
      console.error(`Error inserting articles batch ${i} - ${i + batchSize}:`, batchError);
      return;
    }
    console.log(`Inserted articles ${i} to ${i + batch.length}`);
  }

  console.log('Done!');
}

seed().catch(console.error);
