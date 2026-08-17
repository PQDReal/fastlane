# Motorbike image contract

Motorbike color media is owned by one sellable `version × color` combination.
The canonical runtime source is the matching row in Supabase
`vehicle_variants`:

- `product_id` identifies the motorbike.
- `version` and the base portion of `sku` identify the version.
- `color` identifies the color available for that version.
- `image_car_url` is the full-bike image for this exact combination.
- `image_color_url` is the swatch for this exact combination.

Both image fields are required for every active combination. Different versions
may therefore use different vehicle images and swatches for a color with the
same display name.

The admin create/edit flow stores the same URLs in `product_variants.metadata`
and `vehicle_variants.specs.catalog` as denormalized audit/fallback data, but
public product and deposit pages read the canonical `vehicle_variants` fields.

`products.specifications.color_details` contains one representative pair per
color and `products.image_urls` contains a de-duplicated product gallery. These
fields remain for legacy consumers and old products; they do not define the
media for every version. When an old product has no combination-specific media,
the admin uses `color_details` as a migration fallback and writes the resolved
URLs to each `vehicle_variants` row on the next save.

Version representative images and galleries are separate from color media.
They are stored in `products.specifications.version_media`, with at most 20
detail images per version.
