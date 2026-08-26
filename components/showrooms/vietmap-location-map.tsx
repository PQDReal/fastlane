'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, Navigation, Loader2 } from 'lucide-react'
import type {
  Marker as LeafletMarker,
  Map as LeafletMap,
} from 'leaflet'

export type ShowroomLocation = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  hotline?: string
  category: 'car' | 'motorbike' | 'workshop'
  provinceId?: string
  provinceName?: string
}

function createPopupContent(location: ShowroomLocation) {
  const root = document.createElement('div')
  root.className = 'min-w-[220px] space-y-2 text-sm'

  const title = document.createElement('strong')
  title.className = 'block text-base text-slate-950'
  title.textContent = location.name

  const address = document.createElement('p')
  address.className = 'text-slate-600'
  address.textContent = location.address

  root.append(title, address)

  if (location.hotline) {
    const phone = document.createElement('a')
    phone.className = 'block font-semibold text-brand-700 hover:underline'
    phone.href = `tel:${location.hotline}`
    phone.textContent = `Gọi ${location.hotline}`
    root.append(phone)
  }

  const directions = document.createElement('a')
  directions.className = 'block font-semibold text-brand-700 hover:underline'
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
  directions.target = '_blank'
  directions.rel = 'noreferrer'
  directions.textContent = 'Chỉ đường'
  root.append(directions)

  return root
}

export function VietMapLocationMap({
  locations,
  selectedLocation,
  searchedLocation,
  onSelectLocation,
}: {
  locations: ShowroomLocation[]
  selectedLocation: ShowroomLocation | null
  searchedLocation?: { lat: number; lng: number; address: string } | null
  onSelectLocation?: (location: ShowroomLocation) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerGroupRef = useRef<any>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [apiKey, setApiKey] = useState<string | null | undefined>(
    process.env.NEXT_PUBLIC_VIETMAP_API_KEY || undefined
  )
  const [isLocating, setIsLocating] = useState(false)
  const userMarkerRef = useRef<LeafletMarker | null>(null)
  const searchedMarkerRef = useRef<LeafletMarker | null>(null)

  const locateUser = () => {
    if (!navigator.geolocation) {
      setMapError('Trình duyệt không hỗ trợ định vị.')
      return
    }

    setIsLocating(true)
    setMapError(null)
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        const { latitude, longitude } = position.coords
        
        if (mapRef.current && leafletRef.current) {
          const map = mapRef.current
          const leaflet = leafletRef.current
          
          if (!userMarkerRef.current) {
             const userIcon = leaflet.divIcon({
                className: 'bg-transparent border-0',
                html: '<div class="w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-[0_0_0_4px_rgba(239,68,68,0.3)] animate-pulse"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
             })
             userMarkerRef.current = leaflet.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(map)
             userMarkerRef.current.bindPopup('<div class="text-sm font-medium py-1">Vị trí của bạn</div>')
          } else {
             userMarkerRef.current.setLatLng([latitude, longitude])
          }
          
          map.setView([latitude, longitude], 14, { animate: true })
        }
      },
      (error) => {
        setIsLocating(false)
        console.error('Lỗi định vị:', error)
        if (error.code === error.PERMISSION_DENIED) {
           setMapError('Vui lòng cấp quyền truy cập vị trí để sử dụng tính năng này.')
        } else {
           setMapError('Không thể lấy vị trí hiện tại.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  useEffect(() => {
    if (apiKey !== undefined) return
    let cancelled = false

    void fetch('/api/v1/maps/vietmap-config', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: { apiKey?: string | null } }
        if (!response.ok) throw new Error('Không thể đọc cấu hình VietMap.')
        if (!cancelled) setApiKey(payload.data?.apiKey?.trim() || null)
      })
      .catch((error) => {
        if (!cancelled) {
          setApiKey(null)
          setMapError(error instanceof Error ? error.message : 'Không thể đọc cấu hình VietMap.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [apiKey])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      setTimeout(() => mapRef.current?.invalidateSize(), 100)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      wrapperRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`)
      })
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    if (!mapContainerRef.current) return
    if (apiKey === undefined) return
    if (!apiKey) {
      setMapError('Chưa cấu hình API key VietMap.')
      return
    }

    let cancelled = false
    let map: LeafletMap | null = null

    void import('leaflet')
      .then((leaflet) => {
        if (cancelled || !mapContainerRef.current) return

        leafletRef.current = leaflet
        map = leaflet.map(mapContainerRef.current, {
          preferCanvas: true,
          zoomControl: true,
          attributionControl: false,
        }).setView([16.1, 106.7], 5)

        const tileLayer = leaflet.tileLayer(
          `https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey=${apiKey}`,
          {
            tileSize: 256,
            maxZoom: 20,
            attribution: '© VietMap',
          },
        )

        tileLayer.once('load', () => {
          if (!cancelled) {
            setMapError(null)
            setMapReady(true)
            map?.invalidateSize()
          }
        })
        tileLayer.once('tileerror', () => {
          if (!cancelled) setMapError('Không thể tải tile bản đồ VietMap.')
        })
        tileLayer.addTo(map)

        map.on('zoomend', () => {
          if (map && mapContainerRef.current?.parentElement) {
            const zoom = map.getZoom()
            const el = mapContainerRef.current.parentElement

            if (zoom >= 14) el.classList.add('map-zoomed-in')
            else el.classList.remove('map-zoomed-in')

            if (zoom < 7) el.classList.add('map-zoomed-out')
            else el.classList.remove('map-zoomed-out')
          }
        })
        if (map.getZoom() >= 14) {
          mapContainerRef.current?.parentElement?.classList.add('map-zoomed-in')
        }
        if (map.getZoom() < 7) {
          mapContainerRef.current?.parentElement?.classList.add('map-zoomed-out')
        }

        mapRef.current = map
        requestAnimationFrame(() => map?.invalidateSize())

        resizeObserverRef.current = new ResizeObserver(() => {
          map?.invalidateSize()
        })
        if (mapContainerRef.current) {
          resizeObserverRef.current.observe(mapContainerRef.current)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : 'Không thể khởi tạo bản đồ VietMap.')
        }
      })

    return () => {
      cancelled = true
      if (markerGroupRef.current && map) {
        markerGroupRef.current.clearLayers()
      }
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      map?.remove()
      leafletRef.current = null
      mapRef.current = null
      markerGroupRef.current = null
      setMapReady(false)
    }
  }, [apiKey])

  useEffect(() => {
    const map = mapRef.current
    const leaflet = leafletRef.current
    if (!map || !leaflet || !mapReady) return

    if (!markerGroupRef.current) {
      markerGroupRef.current = leaflet.featureGroup().addTo(map)
    } else {
      markerGroupRef.current.clearLayers()
    }

    locations.forEach((location) => {
      const borderColor = location.category === 'car' ? '#1769e0' : location.category === 'motorbike' ? '#c38d00' : '#16a34a'
      const customIcon = leaflet.divIcon({
        className: 'bg-transparent border-0 cursor-pointer',
        html: `
          <div id="marker-${location.id}" class="showroom-marker flex items-center justify-center w-full h-full transition-transform duration-300">
            <div class="marker-dot w-2.5 h-2.5 rounded-full border-[1.5px] border-white shadow-sm" style="background-color: ${borderColor};"></div>
            <div class="marker-image relative w-9 h-9 rounded-full overflow-hidden border-[3px] bg-slate-900 shadow-md" style="border-color: ${borderColor};">
              <img src="https://res.cloudinary.com/dawbec7mw/image/upload/v1787712193/fastlane/products/fastlane-loading_1787712191879.png" alt="Logo" class="w-full h-full object-cover p-1" />
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
      })

      const marker = leaflet.marker([location.lat, location.lng], {
        icon: customIcon,
        title: location.name,
      }).bindPopup(createPopupContent(location), { offset: [0, -10], autoPan: false })

        ; (marker as any).locationId = location.id

      marker.on('click', () => {
        onSelectLocation?.(location)
      })

      markerGroupRef.current.addLayer(marker)
    })

    if (locations.length > 0) {
      const bounds = markerGroupRef.current.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: true })
      }
    } else {
      map.setView([16.1, 106.7], 5, { animate: true })
    }
  }, [locations, mapReady])

  useEffect(() => {
    locations.forEach((loc) => {
      const el = document.getElementById(`marker-${loc.id}`)
      if (el) {
        if (selectedLocation && loc.id === selectedLocation.id) {
          el.classList.add('animate-bounce')
        } else {
          el.classList.remove('animate-bounce')
        }
      }
    })

    if (!selectedLocation || !mapRef.current) return

    mapRef.current.setView(
      [selectedLocation.lat, selectedLocation.lng],
      14,
      { animate: true },
    )

    if (markerGroupRef.current) {
      markerGroupRef.current.eachLayer((layer: any) => {
        if (layer.locationId === selectedLocation.id) {
          layer.openPopup()
        }
      })
    }
  }, [selectedLocation, locations])

  useEffect(() => {
    if (!searchedLocation || !mapRef.current || !leafletRef.current) return
    const map = mapRef.current
    const leaflet = leafletRef.current

    if (!searchedMarkerRef.current) {
      const icon = leaflet.divIcon({
        className: 'bg-transparent border-0',
        html: '<div class="flex items-center justify-center w-8 h-8 bg-brand-500 text-white rounded-full shadow-lg border-2 border-white"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      })
      searchedMarkerRef.current = leaflet.marker([searchedLocation.lat, searchedLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map)
    } else {
      searchedMarkerRef.current.setLatLng([searchedLocation.lat, searchedLocation.lng])
    }
    
    searchedMarkerRef.current.bindPopup(`<div class="text-sm font-medium py-1">${searchedLocation.address}</div>`).openPopup()
    map.setView([searchedLocation.lat, searchedLocation.lng], 14, { animate: true })
  }, [searchedLocation])

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden bg-slate-100 ${isFullscreen ? 'h-screen w-screen rounded-none border-none' : 'h-[500px] rounded-2xl border border-slate-200 shadow-sm lg:h-[720px]'}`}>
      <style>{`
        .leaflet-tile-pane { filter: grayscale(100%); opacity: 0.8; }
        .showroom-marker .marker-image { display: none; }
        .showroom-marker .marker-dot { display: block; }
        
        .map-zoomed-in .showroom-marker .marker-image { display: block; }
        .map-zoomed-in .showroom-marker .marker-dot { display: none; }
        
        .map-zoomed-out .showroom-marker .marker-dot { 
          width: 4px !important; 
          height: 4px !important; 
          border-width: 0 !important; 
          opacity: 0.6; 
        }
      `}</style>
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      <div className="absolute bottom-6 right-6 z-[400] flex flex-col gap-2">
        <button
          onClick={locateUser}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-md transition hover:bg-slate-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          title="Vị trí của tôi"
          aria-label="Vị trí của tôi"
        >
          {isLocating ? <Loader2 size={20} className="animate-spin" /> : <Navigation size={20} />}
        </button>
        <button
          onClick={toggleFullscreen}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-md transition hover:bg-slate-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={isFullscreen ? 'Thu nhỏ bản đồ' : 'Phóng to bản đồ'}
        >
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>
      {apiKey !== null && !mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-slate-100/90 p-6 text-center text-sm text-slate-600">
          Đang tải bản đồ VietMap...
        </div>
      )}
      {apiKey === null && !mapError && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-100/95 p-6 text-center text-sm text-slate-600">
          Chưa cấu hình API key VietMap.
        </div>
      )}
      {mapError && (
        <div className="absolute left-4 right-4 top-4 z-20 rounded-xl border border-red-200 bg-white/95 p-4 text-sm text-red-700 shadow-lg">
          Không thể tải bản đồ VietMap: {mapError}
        </div>
      )}
    </div>
  )
}
