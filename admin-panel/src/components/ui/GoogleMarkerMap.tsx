import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/loadGoogleMaps';

interface GoogleMarkerMapProps {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  popupHtml?: string;
  height?: number | string;
  zoom?: number;
}

export const GoogleMarkerMap: React.FC<GoogleMarkerMapProps> = ({
  latitude,
  longitude,
  accuracy,
  popupHtml,
  height = 400,
  zoom = 17,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const infoRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return;
        if (!maps || !containerRef.current) {
          setStatus('unavailable');
          return;
        }

        mapsRef.current = maps;
        const center = { lat: latitude, lng: longitude };
        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        markerRef.current = new maps.Marker({
          position: center,
          map,
          title: 'Rider location',
        });
        infoRef.current = new maps.InfoWindow();
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      circleRef.current?.setMap(null);
      markerRef.current?.setMap(null);
      circleRef.current = null;
      markerRef.current = null;
      mapRef.current = null;
      mapsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!maps || !map || !marker) return;

    const position = new maps.LatLng(latitude, longitude);
    marker.setPosition(position);
    map.panTo(position);

    // Replace any previous click listener — re-running this effect (position or
    // popup updates) must not stack listeners on the same marker.
    maps.event.clearInstanceListeners(marker);
    if (popupHtml && infoRef.current) {
      infoRef.current.setContent(popupHtml);
      marker.addListener('click', () => infoRef.current.open({ anchor: marker, map }));
    }

    if (accuracy != null && accuracy > 0) {
      if (!circleRef.current) {
        circleRef.current = new maps.Circle({
          strokeColor: '#10B981',
          strokeOpacity: 0.85,
          strokeWeight: 1,
          fillColor: '#10B981',
          fillOpacity: 0.15,
          map,
          center: position,
          radius: accuracy,
        });
      } else {
        circleRef.current.setCenter(position);
        circleRef.current.setRadius(accuracy);
        circleRef.current.setMap(map);
      }
    } else if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
  }, [accuracy, latitude, longitude, popupHtml]);

  if (status === 'unavailable') {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center bg-amber-50 px-4 text-center text-sm text-amber-800">
        Google Maps is unavailable. Add a valid Maps JavaScript API key.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 text-sm text-gray-500">
          Loading map...
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
      />
    </div>
  );
};

export default GoogleMarkerMap;
