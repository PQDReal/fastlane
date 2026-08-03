# Motorbike `vehicle_variants` migration

## Current state

Read-only production inspection on 2026-07-31 found:

- `vehicle_variants`: 145 rows (`CAR`: 127, `BIKE`: 18).
- All 18 `BIKE` rows are placeholders. They only contain the product identity;
  version, SKU, price, deposit, color, images and specs are empty.
- `products`: 18 active motorbike products with an ordered image contract and
  technical specifications.
- `product_variants`: 26 active motorbike versions.
- Expanding every active version by every available color produces 118 complete
  motorbike `vehicle_variants` rows.
- No existing `deposit_orders` row references a motorbike placeholder.

## Target contract

One `vehicle_variants` row represents one purchasable:

`product × version × exterior color`

Runtime motorbike consumers may group rows by `product_id`. They must use:

- Product identity: `product_id`, `product_name`, `product_slug`, `description`.
- Variant identity: `id`, `sku`, `version`, `variant_name`.
- Pricing: `price`, `original_price`, `sale_price`, `deposit_amount`.
- Color: `color`, `image_car_url`, `image_color_url`, `color_order`.
- Shared media: `listing_image_url`, `hero_image_url`, `detail_image_urls`,
  `brochure_url`.
- Technical data: `specs`.
- Publication: `is_active`, `version_order`.

`products` remains the relational parent through `product_id`, but it is not a
runtime motorbike catalog source after cutover. It can remain in place until
all foreign-key consumers have been migrated.

## Safe rollout

1. Back up all current `vehicle_variants` rows.
2. Check the current source snapshot:

   ```powershell
   npm run verify:motorbike-vehicle-variants
   ```

3. Run `027_migrate_motorbikes_to_vehicle_variants.sql` in a staging project.
4. Run the verifier again and verify:
   - 18 distinct active BIKE products.
   - 118 active BIKE rows for the current snapshot.
   - no missing SKU, version, color, price, deposit or image fields.
   - exactly three detail images per row.
5. Add a server-side motorbike repository that only queries
   `vehicle_variants` and groups rows by `product_id`.
6. Cut over, in order:
   - `/bikes` and `/bikes/[slug]`;
   - deposit and deposit quote validation;
   - compare, cost estimator and test-drive;
   - homepage and global search.
7. Keep the old source reads behind a temporary rollback flag for one release.
8. After acceptance, remove runtime reads of motorbike fields from
   `products`, `product_variants` and `public/data/by_type/motorbikes.json`.

## Important boundary

Do not delete motorbike rows from `products` during this migration.
`vehicle_variants.product_id`, reservations and other existing foreign keys
still depend on those product identities. The cutover changes the source of
display and purchasing information, not the relational product identity.
