import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./055_consolidate_admin_accessory_writer.sql', import.meta.url), 'utf8')
  .replace(/\r\n?/g, '\n')

function functionBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = sql.indexOf('as $function$', start)
  const bodyEnd = sql.indexOf('$function$;', bodyStart)
  return sql.slice(bodyStart, bodyEnd)
}

describe('canonical admin accessory writer migration', () => {
  it('puts current aggregate behavior in the unsuffixed canonical writer', () => {
    const canonical = functionBody('save_admin_accessory_product')

    expect(canonical).toContain("nextval('public.accessory_sku_sequence')")
    expect(canonical).toContain("target_payload ->> 'templateVersionId'")
    expect(canonical).toContain("target_payload -> 'categoryAssignments'")
    expect(canonical).toContain('delete from public.product_media')
    expect(canonical).not.toContain('save_admin_accessory_product_v2(')
    expect(canonical).not.toContain('save_admin_accessory_product_v3(')
    expect(canonical).not.toContain('save_admin_accessory_product_v4(')
  })

  it('uses one membership timestamp and preserves the seen-order invariant', () => {
    const canonical = functionBody('save_admin_accessory_product')

    expect(canonical.match(/v_now := clock_timestamp\(\);/g)).toHaveLength(1)
    expect(canonical).toContain('membership.first_seen_at,\n           membership.last_seen_at,\n           v_now')
    expect(canonical.match(/public\.product_collection_memberships\.first_seen_at/g)?.length).toBeGreaterThanOrEqual(2)
    expect(canonical).not.toContain('last_seen_at = excluded.last_seen_at')
  })

  it('keeps v2, v3 and v4 as thin compatibility aliases', () => {
    for (const version of ['v2', 'v3', 'v4']) {
      const alias = functionBody(`save_admin_accessory_product_${version}`)
      expect(alias).toContain('select public.save_admin_accessory_product(')
      expect(alias).not.toContain('insert into public.')
      expect(alias).not.toContain('update public.')
      expect(alias).not.toContain('delete from public.')
      expect(alias).not.toContain('clock_timestamp()')
    }
  })

  it('locks down every writer to the service role', () => {
    expect(sql).toContain('security definer')
    for (const name of [
      'save_admin_accessory_product',
      'save_admin_accessory_product_v2',
      'save_admin_accessory_product_v3',
      'save_admin_accessory_product_v4',
    ]) {
      expect(sql).toContain(`revoke all on function public.${name}(uuid, timestamptz, jsonb)`)
      expect(sql).toContain(`grant execute on function public.${name}(uuid, timestamptz, jsonb)`)
    }
  })
})
