const { createClient } = require('@supabase/supabase-js'); 
const s = createClient('https://tpvsoegkztjnwxirogkp.supabase.co', 'REDACTED_PUBLIC_HISTORY'); 
s.from('products').select('name').textSearch('search_vector', `'vf':* & '3':*`).then(console.log);
