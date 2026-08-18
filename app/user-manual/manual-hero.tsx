'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronDown } from 'lucide-react'

interface ModelMeta {
  model_name: string
  model_code: string
  versions: string[]
}

interface ManualHeroProps {
  allModels: ModelMeta[]
}

export function ManualHero({ allModels }: ManualHeroProps) {
  const router = useRouter()
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')

  const availableYears = useMemo(() => {
    if (!selectedModel) return []
    const model = allModels.find(m => m.model_code === selectedModel)
    return model ? model.versions : []
  }, [selectedModel, allModels])

  const handleSearch = () => {
    if (selectedModel && selectedYear) {
      // Navigate to /user-manual/[model_code]_[year]
      router.push(`/user-manual/${encodeURIComponent(selectedModel)}_${encodeURIComponent(selectedYear)}`)
    }
  }

  // Generate a smooth background with dark overlay, ideally using a generic car image, but for now a sleek gradient.
  return (
    <div className="relative w-full h-[400px] md:h-[500px] bg-slate-900 flex items-center overflow-hidden">
      {/* Background Image Placeholder (Can be replaced with an actual image url later) */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40"
        style={{ backgroundImage: 'url("https://vinfastauto.com/themes/porto/img/vcreator/vf9/vf9-banner-desktop.jpg")' }}
      ></div>
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/80 to-transparent"></div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-10 lg:px-16 flex flex-col justify-center h-full">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-light text-white mb-2 tracking-tight">
          Cùng bạn bứt phá mọi giới hạn
        </h1>
        <p className="text-blue-400 font-medium text-lg md:text-xl mb-10">
          Hướng dẫn sử dụng
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl">
          {/* Model Selector */}
          <div className="relative flex-1">
            <select
              className="w-full appearance-none bg-white border border-transparent rounded-sm py-3 px-4 pr-10 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value)
                setSelectedYear('') // Reset year
              }}
            >
              <option value="" disabled>Mẫu xe *</option>
              {allModels.map(m => (
                <option key={m.model_code} value={m.model_code}>{m.model_name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          </div>

          {/* Year Selector */}
          {selectedModel && (
            <div className="relative flex-1 animate-in fade-in slide-in-from-left-4 duration-300">
              <select
                className="w-full appearance-none bg-white border border-transparent rounded-sm py-3 px-4 pr-10 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <option value="" disabled>Năm sản xuất *</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={!selectedModel || !selectedYear}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white w-full sm:w-16 h-[48px] rounded-sm flex items-center justify-center transition-colors shrink-0"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
