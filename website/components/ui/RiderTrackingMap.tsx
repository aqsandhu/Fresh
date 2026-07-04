'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Navigation } from 'lucide-react'
import { ordersApi } from '@/lib/api'
import { fetchGoogleMapsApiKey, loadGoogleMapsJs } from '@/lib/loadGoogleMaps'
import { connectSocket, getSocket, resolveSocketAuthToken } from '@/lib/socket'

interface RiderMapProps {
  orderId: string
  riderName: string
}

export default function RiderTrackingMap({ orderId, riderName }: RiderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapsRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const deliveryMarkerRef = useRef<any>(null)
  const routeLineRef = useRef<any>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deliveryLocationRef = useRef<{ lat: number; lng: number } | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fitTrackingView = useCallback((riderPosition: any) => {
    const maps = mapsRef.current
    const map = mapInstanceRef.current
    if (!maps || !map) return

    const delivery = deliveryLocationRef.current
    if (delivery) {
      const bounds = new maps.LatLngBounds()
      bounds.extend(riderPosition)
      bounds.extend(new maps.LatLng(delivery.lat, delivery.lng))
      map.fitBounds(bounds, 64)
      window.setTimeout(() => {
        const zoom = map.getZoom?.()
        if (typeof zoom === 'number' && zoom > 18) map.setZoom(18)
      }, 0)
      return
    }

    map.panTo(riderPosition)
    const zoom = map.getZoom?.()
    if (typeof zoom !== 'number' || zoom < 17) map.setZoom(17)
  }, [])

  const applyRiderPosition = useCallback((lat: number, lng: number) => {
    const maps = mapsRef.current
    const marker = markerRef.current
    if (!maps || !marker) return

    const position = new maps.LatLng(lat, lng)
    marker.setPosition(position)
    fitTrackingView(position)

    if (routeLineRef.current && deliveryLocationRef.current) {
      routeLineRef.current.setPath([
        position,
        new maps.LatLng(deliveryLocationRef.current.lat, deliveryLocationRef.current.lng),
      ])
    }
    setError(null)
  }, [fitTrackingView])

  const updateRiderPosition = useCallback(async () => {
    try {
      const res = await ordersApi.track(orderId)
      const data = res?.data || res
      const rider = data?.rider
      if (rider?.location?.latitude && rider?.location?.longitude) {
        const lat = parseFloat(rider.location.latitude)
        const lng = parseFloat(rider.location.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          applyRiderPosition(lat, lng)
        }
      } else {
        setError('Rider location not available yet')
      }
    } catch {
      // Keep the last known marker visible; polling is only a fallback.
    }
  }, [applyRiderPosition, orderId])

  useEffect(() => {
    let cancelled = false
    let handleSocketLocation: ((payload: any) => void) | null = null

    const initMap = async () => {
      try {
        const key = await fetchGoogleMapsApiKey()
        if (!key) {
          setError('Google Maps API key is missing')
          setLoading(false)
          return
        }

        const maps = await loadGoogleMapsJs()
        if (cancelled || !maps || !mapRef.current) return
        mapsRef.current = maps

        let initialLat = 32.5742
        let initialLng = 74.0789
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
          const delivery = data?.order?.delivery_location
          const deliveryLat = Number(delivery?.latitude)
          const deliveryLng = Number(delivery?.longitude)
          if (Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng)) {
            deliveryLocationRef.current = { lat: deliveryLat, lng: deliveryLng }
          }
        } catch {
          setError('Could not fetch rider location')
        }

        if (cancelled || !mapRef.current) return

        const center = { lat: initialLat, lng: initialLng }
        const map = new maps.Map(mapRef.current, {
          center,
          zoom: 17,
          mapTypeId: 'roadmap',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          scaleControl: true,
          clickableIcons: false,
          maxZoom: 20,
          minZoom: 12,
        })
        mapInstanceRef.current = map

        markerRef.current = new maps.Marker({
          position: center,
          map,
          title: riderName,
          icon: {
            path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#16a34a',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        })

        if (deliveryLocationRef.current) {
          const deliveryPosition = new maps.LatLng(
            deliveryLocationRef.current.lat,
            deliveryLocationRef.current.lng
          )
          deliveryMarkerRef.current = new maps.Marker({
            position: deliveryPosition,
            map,
            title: 'Delivery address',
          })
          routeLineRef.current = new maps.Polyline({
            path: [center, deliveryPosition],
            map,
            strokeColor: '#16a34a',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          })
          fitTrackingView(new maps.LatLng(initialLat, initialLng))
        }

        setLoading(false)

        const token = await resolveSocketAuthToken()
        if (!cancelled && token) {
        const socket = connectSocket(token)
        socket.emit('order:subscribe', orderId)
        handleSocketLocation = (payload: any) => {
          const lat = Number(payload?.latitude)
          const lng = Number(payload?.longitude)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            applyRiderPosition(lat, lng)
          }
        }
        socket.on('rider:location', handleSocketLocation)
      }

        pollRef.current = setInterval(updateRiderPosition, 5000)
      } catch {
        if (!cancelled) {
          setError('Google Maps could not load')
          setLoading(false)
        }
      }
    }

    void initMap()

    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      const socket = getSocket()
      socket?.emit('order:unsubscribe', orderId)
      if (handleSocketLocation) socket?.off('rider:location', handleSocketLocation)
      markerRef.current?.setMap?.(null)
      deliveryMarkerRef.current?.setMap?.(null)
      routeLineRef.current?.setMap?.(null)
      markerRef.current = null
      deliveryMarkerRef.current = null
      routeLineRef.current = null
      mapInstanceRef.current = null
      mapsRef.current = null
      deliveryLocationRef.current = null
    }
  }, [applyRiderPosition, fitTrackingView, orderId, riderName, updateRiderPosition])

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b bg-green-50 px-6 py-4">
        <Navigation className="h-5 w-5 text-green-600" />
        <h2 className="text-lg font-semibold text-green-900">Track Rider</h2>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs text-yellow-700">
            {error}
          </div>
        )}
        <div ref={mapRef} className="h-72 w-full" />
      </div>
    </div>
  )
}
