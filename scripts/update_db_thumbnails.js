const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const fs = require('fs');

const vehiclesData = JSON.parse(fs.readFileSync('public/data/by_type/manual_vehicles.json', 'utf8')).data;

async function update() {
  const { data: models, error: selectErr } = await supabase.from('manual_models').select('id, model_series, year');
  if (selectErr) return console.error(selectErr);
  
  // Create a mapping from manual_vehicles.json
  const modelInfoMap = new Map();
  for (const [category, categoryModels] of Object.entries(vehiclesData.models || {})) {
    for (const m of categoryModels) {
      if (m.version_thumbnails) {
        for (const [year, url] of Object.entries(m.version_thumbnails)) {
          modelInfoMap.set(m.model_code + '_' + year, url);
        }
      }
      modelInfoMap.set(m.model_code, m.thumbnail); // generic
    }
  }

  let updatedCount = 0;
  for (const m of models) {
    const key = m.model_series + (m.year ? '_' + m.year : '');
    const url = modelInfoMap.get(key) || modelInfoMap.get(m.model_series);
    if (url) {
      const { error } = await supabase.from('manual_models').update({ thumbnail: url }).eq('id', m.id);
      if (error) {
        console.error('Error updating', m.id, error);
      } else {
        updatedCount++;
      }
    }
  }
  
  console.log(`Successfully updated ${updatedCount} DB models!`);
}
update();
