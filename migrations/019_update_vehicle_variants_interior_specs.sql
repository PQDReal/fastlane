-- Migration 019: Update vehicle_variants specs with interior colors

BEGIN;

DO $$
DECLARE
  v_record RECORD;
  v_interior_colors jsonb;
  v_is_eco boolean;
  
  -- Predefined interior colors JSON
  v_ci11 jsonb := '{"name": "Granite Black", "hex": "#111111", "swatch": "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw9a153245/images/deposit/interior/CI11.webp"}';
  v_ci12 jsonb := '{"name": "Saddle Brown", "hex": "#633517", "swatch": "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw65203801/images/deposit/interior/CI12.webp"}';
  v_ci13 jsonb := '{"name": "Cotton Beige", "hex": "#d6cdb4", "swatch": "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw6b5810a9/images/deposit/interior/CI13.webp"}';
  v_ci18 jsonb := '{"name": "Mocca Brown", "hex": "#6b4e31", "swatch": "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7e53f19e/images/deposit/interior/CI18.webp"}';
  v_ci1m jsonb := '{"name": "Grey", "hex": "#808080", "swatch": "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw33eb76b4/images/deposit/interior/CI1M.webp"}';
  
BEGIN
  FOR v_record IN SELECT id, product_name, version, color, specs FROM public.vehicle_variants WHERE product_type = 'CAR'
  LOOP
    v_interior_colors := '[]'::jsonb;
    v_is_eco := v_record.version ILIKE '%eco%';

    IF v_record.product_name ILIKE '%VF 2%' THEN
      v_interior_colors := jsonb_build_array(v_ci11 || '{"images": []}'::jsonb);
      
    ELSIF v_record.product_name ILIKE '%VF 3%' THEN
      v_interior_colors := jsonb_build_array(v_ci1m || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF3/TI1CV/interior/CI11/1.jpg"]}'::jsonb);
      
    ELSIF v_record.product_name ILIKE '%VF 5%' THEN
      v_interior_colors := jsonb_build_array(v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF5/GA12V/interior/CI11/1.jpg"]}'::jsonb);
      
    ELSIF v_record.product_name ILIKE '%VF 6%' THEN
      IF v_is_eco THEN
        IF v_record.color = 'Jet Black' OR v_record.color = 'Solar Ruby' THEN
          v_interior_colors := jsonb_build_array(v_ci11 || '{"images": []}'::jsonb, v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI13/1.webp"]}'::jsonb);
        ELSE
          v_interior_colors := jsonb_build_array(v_ci11 || '{"images": []}'::jsonb);
        END IF;
      ELSE
        IF v_record.color = 'Solar Ruby' THEN
          v_interior_colors := jsonb_build_array(v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI13/1.webp"]}'::jsonb);
        ELSIF v_record.color = 'Jet Black' THEN
          v_interior_colors := jsonb_build_array(
            v_ci18 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/1.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/2.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/3.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/4.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/5.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/6.png"]}'::jsonb, 
            v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI13/1.webp"]}'::jsonb
          );
        ELSE
          v_interior_colors := jsonb_build_array(
            v_ci18 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/1.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/2.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/3.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/4.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/5.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF6/interior/CI18/6.png"]}'::jsonb
          );
        END IF;
      END IF;

    ELSIF v_record.product_name ILIKE '%VF 7%' THEN
      IF v_is_eco THEN
        IF v_record.color = 'Jet Black' OR v_record.color = 'Solar Ruby' THEN
          v_interior_colors := jsonb_build_array(
            v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/4.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/5.webp"]}'::jsonb, 
            v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/4.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/5.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/6.webp"]}'::jsonb
          );
        ELSE
          v_interior_colors := jsonb_build_array(
            v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/4.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI11/5.webp"]}'::jsonb
          );
        END IF;
      ELSE
        IF v_record.color = 'Solar Ruby' THEN
          v_interior_colors := jsonb_build_array(
            v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/4.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/5.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/6.webp"]}'::jsonb
          );
        ELSIF v_record.color = 'Jet Black' THEN
          v_interior_colors := jsonb_build_array(
            v_ci18 || '{"images": []}'::jsonb, 
            v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/4.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/5.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF7/interior/CI13/6.webp"]}'::jsonb
          );
        ELSE
          v_interior_colors := jsonb_build_array(
            v_ci18 || '{"images": []}'::jsonb
          );
        END IF;
      END IF;
      
    ELSIF v_record.product_name ILIKE '%VF 8%' THEN
      IF v_record.color IN ('Infinity Blanc', 'Starburst Blue', 'Jet Black', 'Starburst Blue Body - Infinity Blanc Roof', 'Jet Black Body - Stealth Gray Roof') THEN
        IF v_record.product_name ILIKE '%All-New%' THEN
          v_interior_colors := jsonb_build_array(
            v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8-THE-ALL-NEW/interior/CI11/1.webp"]}'::jsonb,
            v_ci12 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8-THE-ALL-NEW/interior/CI12/1.webp"]}'::jsonb
          );
        ELSE
          v_interior_colors := jsonb_build_array(
            v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/1.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/2.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/3.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/4.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/5.png"]}'::jsonb,
            v_ci12 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI12/1.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI12/2.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI12/3.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI12/4.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI12/5.png"]}'::jsonb
          );
        END IF;
      ELSE
        IF v_record.product_name ILIKE '%All-New%' THEN
          v_interior_colors := jsonb_build_array(
            v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8-THE-ALL-NEW/interior/CI11/1.webp"]}'::jsonb
          );
        ELSE
          v_interior_colors := jsonb_build_array(
            v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/1.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/2.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/3.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/4.png", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF8/interior/CI11/5.png"]}'::jsonb
          );
        END IF;
      END IF;
      
    ELSIF v_record.product_name ILIKE '%VF 9%' THEN
      v_interior_colors := jsonb_build_array(v_ci11 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI11/1.jpg", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI11/2.jpg"]}'::jsonb);
      IF NOT v_is_eco AND v_record.color != 'Crimson Red' THEN
        v_interior_colors := v_interior_colors || (v_ci12 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/4.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/5.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/6.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/7.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/8.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/9.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI12/10.webp"]}'::jsonb);
      END IF;
      IF v_record.color IN ('Jet Black', 'Crimson Red', 'Ivy Green') THEN
        v_interior_colors := v_interior_colors || (v_ci13 || '{"images": ["https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI13/1.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI13/2.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI13/3.webp", "https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VF9/interior/CI13/4.webp"]}'::jsonb);
      END IF;
      
    ELSIF v_record.product_name ILIKE '%MPV%' THEN
      IF v_record.color = 'Solar Ruby' OR v_record.color = 'Introspective Brown' THEN
        v_interior_colors := jsonb_build_array(v_ci11 || '{"images": []}'::jsonb);
      ELSE
        v_interior_colors := jsonb_build_array(v_ci11 || '{"images": []}'::jsonb, v_ci18 || '{"images": []}'::jsonb);
      END IF;
      
    ELSE
      -- Fallback
      v_interior_colors := jsonb_build_array(v_ci11 || '{"images": []}'::jsonb);
    END IF;

    -- Cập nhật vào cột specs
    UPDATE public.vehicle_variants 
    SET specs = jsonb_set(COALESCE(specs, '{}'::jsonb), '{interior_colors}', v_interior_colors)
    WHERE id = v_record.id;
    
  END LOOP;
END $$;

COMMIT;
