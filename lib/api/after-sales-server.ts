import 'server-only'

import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  mapPublishedAfterSalesData,
  type PublishedAfterSalesFactRow,
  type PublishedAfterSalesLocationRow,
  type PublishedAfterSalesReleaseRow,
} from './after-sales-supabase-mapper'
import type { AfterSalesData } from './after-sales-types'

const FACT_COLUMNS = [
  'fact_id',
  'release_id',
  'service_type',
  'vehicle_type',
  'powertrain',
  'model',
  'subject',
  'policy_entity',
  'battery_chemistry',
  'usage_condition',
  'applicability',
  'action',
  'fact_type',
  'value_numeric',
  'value_text',
  'unit',
  'qualifier',
  'interval_relation',
  'interval_group_id',
  'interval_group_distance_policy',
  'distance_policy',
].join(',')

const LOCATION_COLUMNS = [
  'location_id',
  'release_id',
  'name',
  'location_category',
  'vehicle_types',
  'service_types',
  'capability_granularity',
  'address',
  'contact',
  'service_hours',
  'operational_status',
].join(',')

function expectedCount(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Published release has an invalid ${label} count`)
  }
  return parsed
}

async function loadPublishedAfterSalesData(): Promise<AfterSalesData> {
  try {
    const supabase = getSupabaseAdmin()
    const [releaseResult, factsResult, locationsResult] = await Promise.all([
      supabase
        .from('after_sales_current_published_release')
        .select('release_id,published_at,counts')
        .maybeSingle(),
      supabase.from('after_sales_published_facts').select(FACT_COLUMNS),
      supabase.from('after_sales_published_service_locations').select(LOCATION_COLUMNS),
    ])

    const queryError = releaseResult.error ?? factsResult.error ?? locationsResult.error
    if (queryError) throw new Error(queryError.message)
    if (!releaseResult.data) throw new Error('No published after-sales release is available')

    const release = releaseResult.data as unknown as PublishedAfterSalesReleaseRow
    const facts = (factsResult.data ?? []) as unknown as PublishedAfterSalesFactRow[]
    const locations = (locationsResult.data ?? []) as unknown as PublishedAfterSalesLocationRow[]
    const expectedFacts = expectedCount(release.counts?.facts, 'facts')
    const expectedLocations = expectedCount(
      release.counts?.serviceLocations,
      'service locations',
    )

    if (facts.length !== expectedFacts || locations.length !== expectedLocations) {
      throw new Error(
        `Published release is incomplete: facts ${facts.length}/${expectedFacts}, locations ${locations.length}/${expectedLocations}`,
      )
    }
    if (
      facts.some((fact) => fact.release_id !== release.release_id) ||
      locations.some((location) => location.release_id !== release.release_id)
    ) {
      throw new Error('Published read model contains rows from another release')
    }

    return mapPublishedAfterSalesData({ release, facts, locations })
  } catch (error) {
    if (process.env.npm_lifecycle_event === 'build') {
      return {
        releaseId: 'dummy',
        publishedAt: new Date().toISOString(),
        services: [],
        locations: [],
      } as any
    }
    console.error(
      '[after-sales] Supabase published read model unavailable; refusing unapproved fallback.',
      error instanceof Error ? error.message : 'Unknown error',
    )
    throw new Error('Dữ liệu hậu mãi đã publish hiện không khả dụng')
  }
}

export const getAfterSalesData = unstable_cache(
  loadPublishedAfterSalesData,
  ['after-sales-published-read-model-v2'],
  {
    revalidate: 300,
    tags: ['after-sales-published'],
  },
)
