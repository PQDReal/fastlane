import { getManualModels } from '@/lib/api/manuals-server'
import { ManualHero } from './manual-hero'
import { VehicleCatalog } from './vehicle-catalog'

// Manual data is managed in Supabase and must be read after deployment as
// well as during build. Avoid baking an empty catalog into a static page when
// build-time environment variables are unavailable.
export const dynamic = 'force-dynamic'

export default async function UserManualPage() {
  const dbModels = await getManualModels()
  
  const categoriesMap = new Map<string, number>()
  let catId = 1
  
  const modelsMap: Record<string, any[]> = {}
  
  // Group by model_series (e.g., "VF 7")
  const seriesGroups = new Map<string, {
    category: string,
    model_name: string,
    model_code: string,
    thumbnail: string,
    versions: string[],
    version_thumbnails: Record<string, string>
  }>()

  dbModels.forEach(m => {
    if (m.category) {
      if (!categoriesMap.has(m.category)) {
        categoriesMap.set(m.category, catId++)
      }
    }
    const cat = m.category || 'OTHER'
    const series = m.model_series
    
    if (!seriesGroups.has(series)) {
      seriesGroups.set(series, {
        category: cat,
        model_name: series,
        model_code: series,
        thumbnail: m.thumbnail || '',
        versions: [],
        version_thumbnails: {}
      })
    }
    
    const group = seriesGroups.get(series)!
    if (m.year && !group.versions.includes(m.year)) {
      group.versions.push(m.year)
      group.version_thumbnails[m.year] = m.thumbnail || ''
    }
  })

  seriesGroups.forEach(group => {
    // sort versions desc (newer year first)
    group.versions.sort((a, b) => b.localeCompare(a))
    if (!modelsMap[group.category]) {
      modelsMap[group.category] = []
    }
    modelsMap[group.category].push(group)
  })

  const categories = Array.from(categoriesMap.entries()).map(([code_name, id]) => ({
    id,
    code_name
  }))

  const allModels = Array.from(seriesGroups.values())

  return (
    <div className="flex-1 flex flex-col">
      <ManualHero allModels={allModels} />
      <VehicleCatalog categories={categories} modelsMap={modelsMap} />
    </div>
  )
}
