# Global assistant search

Global search remains catalog-first. `POST /api/v1/search/assistant` classifies the query with the pure rule engine, retrieves allow-listed public product fields, then optionally asks OpenAI for a short Vietnamese summary. Prices, inventory, images and product IDs always come from the catalog query; the model cannot invent or query the database.

Required server-only variables:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ASSISTANT_SEARCH_ENABLED=false
ASSISTANT_LLM_TIMEOUT_MS=3500
```

RAG is intentionally not required for current catalog search. Add a retriever only for long, curated public policy/specification documents. Never index customer data or use RAG as the source of current price/stock.

Fallback behavior: OpenAI timeout, quota error, malformed JSON or Redis failure returns deterministic catalog results with a rules-generated message.
