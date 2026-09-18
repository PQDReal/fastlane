const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const assets = JSON.parse(fs.readFileSync('D:\\data vinfast\\vinfast-om\\data\\normalized\\assets.json', 'utf8'));
  const urlMap = {};
  assets.forEach(a => {
    if (a.relativePath && a.source_url) {
      urlMap[a.relativePath] = a.source_url;
    }
  });

  let allArticles = [];
  let from = 0;
  const size = 1000;
  
  while (true) {
    const { data, error } = await supabase.from('manual_articles').select('id, content_html').range(from, from + size - 1);
    if (error) {
      console.error(error);
      break;
    }
    allArticles = allArticles.concat(data);
    if (data.length < size) break;
    from += size;
  }

  console.log('Fetched ' + allArticles.length + ' total articles');
  let updatedCount = 0;

  for (const article of allArticles) {
    if (article.content_html) {
      let replaced = false;
      const newHtml = article.content_html.replace(/src=\"(\/assets\/images\/[^\"]+)\"/g, (match, path) => {
        if (urlMap[path]) {
          replaced = true;
          return `src="${urlMap[path]}"`;
        }
        return match;
      });

      if (replaced) {
        await supabase.from('manual_articles').update({ content_html: newHtml }).eq('id', article.id);
        updatedCount++;
        if (updatedCount % 100 === 0) console.log('Updated ' + updatedCount);
      }
    }
  }
  console.log('Finished updating ' + updatedCount + ' articles in DB.');
}

run().catch(console.error);
