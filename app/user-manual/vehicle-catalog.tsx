'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

interface VehicleCategory {
  id: number
  code_name: string
}

interface ModelMeta {
  model_name: string
  model_code: string
  thumbnail: string
  versions: string[]
  version_thumbnails?: Record<string, string>
}

interface VehicleCatalogProps {
  categories: VehicleCategory[]
  modelsMap: Record<string, ModelMeta[]>
}

export function VehicleCatalog({ categories, modelsMap }: VehicleCatalogProps) {
  const router = useRouter()
  // Try to default to SUV if available, else first category
  const defaultTab = categories.find(c => c.code_name === 'SUV')?.code_name || categories[0]?.code_name
  const [activeTab, setActiveTab] = useState<string>(defaultTab)
  
  const activeModels = modelsMap[activeTab] || []
  // Auto-select the first model when tab changes
  const [selectedModel, setSelectedModel] = useState<ModelMeta | null>(activeModels[0] || null)
  const [selectedYear, setSelectedYear] = useState<string>('')

  // Reset selected model when tab changes
  useEffect(() => {
    const models = modelsMap[activeTab] || []
    setSelectedModel(models[0] || null)
    setSelectedYear('')
  }, [activeTab, modelsMap])

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300 // Adjust scroll distance
      const currentScroll = scrollContainerRef.current.scrollLeft
      scrollContainerRef.current.scrollTo({
        left: direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  const handleSearch = () => {
    if (selectedModel && selectedYear) {
      router.push(`/user-manual/${encodeURIComponent(selectedModel.model_code)}_${encodeURIComponent(selectedYear)}`)
    }
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-7xl mx-auto px-6 md:px-10 lg:px-16 pt-16 pb-8">
        <h2 className="text-3xl md:text-4xl font-light text-slate-800 mb-10 text-center">VinFast - Hướng dẫn sử dụng xe</h2>
        
        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {categories.map((cat) => {
            const isActive = activeTab === cat.code_name
            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.code_name)}
                className={`px-5 py-2 text-sm font-semibold tracking-wider transition-all rounded-full border ${
                  isActive 
                    ? 'border-blue-400 text-blue-500 bg-blue-50/30' 
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.code_name}
              </button>
            )
          })}
        </div>

        {/* Horizontal Carousel */}
        <div className="relative group w-full">
          {/* Navigation Arrows */}
          <button 
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-12 z-10 w-10 h-16 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 rounded-sm shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div 
            ref={scrollContainerRef}
            className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 md:gap-6 py-4 px-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {activeModels.map(model => {
              const isSelected = selectedModel?.model_code === model.model_code
              return (
                <button
                  key={model.model_code}
                  onClick={() => {
                    setSelectedModel(model)
                    setSelectedYear('')
                  }}
                  className={`flex-none w-40 md:w-48 lg:w-56 flex flex-col items-center justify-center p-4 snap-start border rounded-sm transition-all bg-white ${
                    isSelected ? 'border-slate-400 shadow-sm' : 'border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="w-full h-24 flex items-center justify-center mb-4">
                    <img 
                      src={model.thumbnail} 
                      alt={model.model_name} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply"
                    />
                  </div>
                  <span className="text-slate-600 font-medium text-sm">
                    {model.model_name}
                  </span>
                </button>
              )
            })}
          </div>

          <button 
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-12 z-10 w-10 h-16 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 rounded-sm shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedModel && (
        <div className="w-full bg-[#f8f9fa] border-t border-slate-200 mt-8 py-16 animate-in fade-in duration-150">
          <div className="max-w-7xl mx-auto px-6 md:px-10 lg:px-16 flex flex-col md:flex-row items-center justify-between gap-12">
            
            {/* Left Side: Form */}
            <div className="flex-1 w-full max-w-md flex flex-col">
              <h3 className="text-4xl md:text-5xl font-semibold text-slate-800 mb-3">{selectedModel.model_name}</h3>
              <p className="text-slate-600 mb-8">Vui lòng chọn một trong các mẫu xe được hiển thị</p>
              
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-white border border-slate-300 rounded-sm py-3 px-4 pr-10 text-slate-700 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    <option value="" disabled>Năm sản xuất</option>
                    {selectedModel.versions.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
                
                <button
                  onClick={handleSearch}
                  disabled={!selectedYear}
                  className="w-full sm:w-auto self-start border-2 border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-blue-300 disabled:text-blue-300 disabled:bg-transparent font-medium py-3 px-10 rounded-sm transition-colors uppercase tracking-wide text-sm mt-2"
                >
                  Tìm kiếm
                </button>
              </div>
            </div>

            {/* Right Side: Large Image */}
            <div className="flex-1 w-full flex items-center justify-center">
              {/* Note: In a real app we'd want a higher-res image here, but we use the thumbnail scaled up */}
              <img 
                src={selectedModel.thumbnail} 
                alt={selectedModel.model_name}
                className="w-full max-w-lg object-contain drop-shadow-xl mix-blend-multiply"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
