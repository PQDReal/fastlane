# Motorbike image contract

Motorbike pages read their runtime image URLs from `public.products.image_urls`
in Supabase. External image URLs must not be added to `lib/bike-images.ts`.

For every motorbike, store exactly this ordered JSON array:

1. Listing image used by `/bikes` and search cards.
2. Hero image used at the top of `/bikes/[slug]`.
3. One pair per `specifications.color_details` entry, in the same order:
   full-bike color image, then its swatch image.
4. Exactly three detail images.

For `N` colors, the required array length is `2 + (N * 2) + 3`.

Example with two colors:

```json
[
  "https://cdn.example/listing.webp",
  "https://cdn.example/hero.webp",
  "https://cdn.example/red-bike.webp",
  "https://cdn.example/red-swatch.webp",
  "https://cdn.example/white-bike.webp",
  "https://cdn.example/white-swatch.webp",
  "https://cdn.example/detail-1.webp",
  "https://cdn.example/detail-2.webp",
  "https://cdn.example/detail-3.webp"
]
```

The parser rejects incomplete or shifted arrays instead of pairing a color
label with the wrong vehicle image. Legacy gallery fields in
`products.specifications` are only a compatibility fallback.
