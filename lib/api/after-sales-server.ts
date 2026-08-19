import 'server-only'

import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { FALLBACK_AFTER_SALES_DATA } from './after-sales-data'
import type { AfterSalesData, WarrantyFactItem } from './after-sales-types'

export const getAfterSalesData = cache(async (): Promise<AfterSalesData> => {
  try {
    const supabase = getSupabaseAdmin()
    const { data: facts, error } = await supabase
      .from('after_sales_facts')
      .select('*')
      .eq('approval_status', 'approved')

    if (error || !facts || facts.length === 0) {
      // Return structured verified fallback dataset
      return FALLBACK_AFTER_SALES_DATA
    }

    // Merge Supabase facts into after sales data structure
    const warranties: WarrantyFactItem[] = [...FALLBACK_AFTER_SALES_DATA.warranties]

    facts.forEach((fact: any) => {
      if (fact.fact_type === 'warranty-term' && fact.model) {
        const existing = warranties.find((w) =>
          w.models.some((m) => m.toLowerCase() === fact.model.toLowerCase()),
        )
        if (existing) {
          existing.warrantyTerm = `${fact.value_numeric || fact.value_text} ${fact.unit}`.trim()
        }
      }
    })

    return {
      ...FALLBACK_AFTER_SALES_DATA,
      warranties,
      sourcesSyncedAt: new Date().toISOString(),
    }
  } catch {
    return FALLBACK_AFTER_SALES_DATA
  }
})
