'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Navigation, Loader2 } from 'lucide-react'
import { ordersApi } from '@/lib/api'

interface RiderMapProps {
  orderId: string
  riderName: string
}

export default function RiderTrackingMap({ orderId, riderName }: RiderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const updateRiderPosition = useCallback(async () => {
    try {
      const res = await ordersApi.track(orderId)
      const data = res?.data || res
      const rider = data?.rider
      if (rider?.location?.latitude && rider?.location?.longitude) {
        const lat = parseFloat(rider.location.latitude)
        const lng = parseFloat(rider.location.longitude)
        
        if (mapInstanceRef.current && markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
          mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom())
        }
        setError(null)
      } else {
        setError('Rider location not available yet')
      }
    } catch {
      // silent
    }
  }, [orderId])

  useEffect(() => {
    let cancelled = false;

    const initMap = async () => {
      // Dynamically import Leaflet
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (cancelled || !mapRef.current) return

      // Get initial location
      let initialLat = 31.5204, initialLng = 74.3587 // Lahore default
      try {
        const res = await ordersApi.track(orderId)
        const data = res?.data || res
        const rider = data?.rider
        if (rider?.location?.latitude && rider?.location?.longitude) {
          initialLat = parseFloat(rider.location.latitude)
          initialLng = parseFloat(rider.location.longitude)
          setError(null)
        } else {
          setError('Waiting for rider location...')
        }
      } catch {
        setError('Could not fetch rider location')
      }

      if (cancelled || !mapRef.current) return

      const map = L.map(mapRef.current).setView([initialLat, initialLng], 15)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      // Custom rider icon
      const riderIcon = L.divIcon({
        className: 'rider-marker',
        html: `<div style="
          width: 40px; height: 40px; 
          background: #16a34a; 
          border-radius: 50%; 
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          border: 3px solid white;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })

      markerRef.current = L.marker([initialLat, initialLng], { icon: riderIcon })
        .addTo(map)
        .bindPopup(`<b>${riderName}</b><br>Your delivery rider`)

      setLoading(false)

      // Poll for updates
      pollRef.current = setInterval(updateRiderPosition, 5000)
    }

    initMap()

    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [orderId, riderName, updateRiderPosition])

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b bg-green-50">
        <Navigation className="w-5 h-5 text-green-600" />
        <h2 className="text-lg font-semibold text-green-900">Track Rider</h2>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        )}
        {error && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full text-xs border border-yellow-200">
            {error}
          </div>
        )}
        <div ref={mapRef} className="h-72 w-full" />
      </div>
    </div>
  )
}
