ALTER TABLE public.products ADD COLUMN IF NOT EXISTS thumbnail_url text;

UPDATE public.products SET thumbnail_url = 'https://vinfastauto.com/themes/porto/img/pdp-page/vf2/vf2-car/vf2-infinity-blanc-car.webp' WHERE slug = 'vf-2';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784768418972/ldp-all-cars/360/VF3/exterior/CE18/F1.png' WHERE slug = 'vf-3';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw32aad97c/reserves/VF5/2025/12.webp' WHERE slug = 'vf-5';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw445cc03b/images/VF6/JB10V/CE18.webp' WHERE slug = 'vf-6';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw0c109403/reserves/VF7/exterior/product-CE18.webp' WHERE slug = 'vf-7';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw5e18d16a/images/VF7/GC15V/CE18.webp' WHERE slug = 'vf-mpv-7';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3aa598fc/images/VF8/ND32V/CE18.webp' WHERE slug = 'vf-8';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw61dd02a5/images/VF8-THE-ALL-NEW/HC11V/CE18.webp' WHERE slug = 'vf-8-all-new';
UPDATE public.products SET thumbnail_url = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwec05bc92/images/VF9/NE3LV/CE18.webp' WHERE slug = 'vf-9';
