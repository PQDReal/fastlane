const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function run() {
  console.log('Loading models.json...');
  const modelsJson = JSON.parse(fs.readFileSync('D:/data vinfast/vinfast-om/data/checkpoints/models.json', 'utf8'));
  
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  console.log('Fetching manual_models from DB...');
  const { data: modelsInDb, error } = await supabase.from('manual_models').select('id');
  if (error) {
    console.error('Error fetching data:', error);
    return;
  }
  
  console.log(`Found ${modelsInDb.length} models in the database.`);
  
  let updatedCount = 0;
  for (const row of modelsInDb) {
    if (modelsJson[row.id] && modelsJson[row.id].thumbnail) {
      const newThumbnailUrl = modelsJson[row.id].thumbnail;
      
      const { error: updateError } = await supabase
        .from('manual_models')
        .update({ thumbnail: newThumbnailUrl })
        .eq('id', row.id);
        
      if (updateError) {
        console.error(`Error updating ${row.id}:`, updateError.message);
      } else {
        console.log(`Updated ${row.id} -> ${newThumbnailUrl}`);
        updatedCount++;
      }
    } else {
      console.warn(`No thumbnail found in models.json for ${row.id}`);
    }
  }
  
  console.log(`Done! Updated ${updatedCount} model thumbnails in the database.`);
}

run().catch(console.error);
