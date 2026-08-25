import { getManualModels } from '@/lib/api/manuals-server'
import { ManualHero } from './manual-hero'
import { VehicleCatalog } from './vehicle-catalog'

export const dynamic = 'force-dynamic'

interface ManualCatalogModel {
  category: string
  model_name: string
  model_code: string
  thumbnail: string
  versions: string[]
  version_thumbnails: Record<string, string>
}

export default async function UserManualPage() {
  const dbModels = await getManualModels()
  const categoriesMap = new Map<string, number>()
  const modelsMap: Record<string, ManualCatalogModel[]> = {}
  const seriesGroups = new Map<string, ManualCatalogModel>()
  let categoryId = 1

  for (const model of dbModels) {
    const category = model.category || 'OTHER'

    if (!categoriesMap.has(category)) {
      categoriesMap.set(category, categoryId++)
    }

    if (!seriesGroups.has(model.model_series)) {
      seriesGroups.set(model.model_series, {
        category,
        model_name: model.model_series,
        model_code: model.model_series,
        thumbnail: model.thumbnail || '',
        versions: [],
        version_thumbnails: {},
      })
    }

    const group = seriesGroups.get(model.model_series)!
    if (model.year && !group.versions.includes(model.year)) {
      group.versions.push(model.year)
      group.version_thumbnails[model.year] = model.thumbnail || ''
    }
  }

  for (const group of seriesGroups.values()) {
    group.versions.sort((a, b) => b.localeCompare(a))
    modelsMap[group.category] ||= []
    modelsMap[group.category].push(group)
  }

  const categories = Array.from(categoriesMap, ([code_name, id]) => ({ id, code_name }))
  const allModels = Array.from(seriesGroups.values())

  return (
    <div className="flex flex-1 flex-col">
      <ManualHero allModels={allModels} />
      <VehicleCatalog categories={categories} modelsMap={modelsMap} />
    </div>
  )
}
