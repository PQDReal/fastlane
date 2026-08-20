const fs = require('fs'); 
const files = fs.readdirSync('public/assets/images/'); 
const sizes = files.map(f => fs.statSync('public/assets/images/' + f).size); 
const buckets = [0, 500, 1000, 2000, 5000, 10000, 50000, 100000]; 
const counts = buckets.map(b => sizes.filter(s => s >= b && s < (buckets[buckets.indexOf(b)+1] || Infinity)).length); 
console.log(buckets.map((b, i) => `${b} - ${buckets[i+1] || 'inf'}: ${counts[i]}`).join('\n'));
