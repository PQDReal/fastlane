let finalMarkdown = 'Anh/chị có thể xem thêm Dự toán trả góp. [{"label":"So sánh Evo và Feliz 2025","intent":"So sánh xe máy điện VinFast Evo và Feliz 2025"},{"label":"Chính sách bảo hành","intent":"';

const suggestionStartIndex = finalMarkdown.search(/\[\s*\{\s*"(label|intent)"/);
let parsedSuggestions = [];

if (suggestionStartIndex !== -1) {
  const possibleJson = finalMarkdown.substring(suggestionStartIndex);
  
  try {
    const lastCloseBracket = possibleJson.lastIndexOf(']');
    if (lastCloseBracket !== -1) {
      const jsonStr = possibleJson.substring(0, lastCloseBracket + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        parsedSuggestions = parsed.filter(p => p.label && p.intent).map(p => ({ text: p.label, payload: p.intent })).slice(0, 5);
      }
    }
  } catch(e) {}
  
  if (parsedSuggestions.length === 0) {
    const labels = [...possibleJson.matchAll(/"label"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
    const intents = [...possibleJson.matchAll(/"intent"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
    const count = Math.min(labels.length, intents.length, 5);
    for (let i = 0; i < count; i++) {
      parsedSuggestions.push({ text: labels[i], payload: intents[i] });
    }
  }
  
  finalMarkdown = finalMarkdown.substring(0, suggestionStartIndex).trim();
}

console.log('Suggestions:', parsedSuggestions);
console.log('Markdown:', finalMarkdown);
