const fs = require('fs');
const assets = JSON.parse(fs.readFileSync('D:\\data vinfast\\vinfast-om\\data\\normalized\\assets.json', 'utf8'));
const urlMap = {};
assets.forEach(a => {
  if (a.relativePath && a.source_url) {
    urlMap[a.relativePath] = a.source_url;
  }
});

const articlesPath = 'public/data/by_type/vf_manual_articles.json';
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));

let replacedCount = 0;
for (const article of articles) {
  if (article.content_html) {
    article.content_html = article.content_html.replace(/src=\"(\/assets\/images\/[^\"]+)\"/g, (match, path) => {
      if (urlMap[path]) {
        replacedCount++;
        return `src="${urlMap[path]}"`;
      }
      return match;
    });
  }
}

fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2));
console.log('Replaced ' + replacedCount + ' image src attributes in ' + articles.length + ' articles.');
