// Compatibility entry point. Baseline v2 no longer imports legacy live manual_articles.
// It prepares a deterministic local bundle from the 31-edition Markdown corpus.
console.warn('import-vinfast-manuals.mjs now runs the Markdown-first local preparation step; it does not write Supabase.')
await import('./prepare-vinfast-knowledge.mjs')
