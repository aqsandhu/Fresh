import React, { useEffect, useRef } from 'react';

declare const L: any;

interface LeafletMapProps {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  popupHtml?: string;
  height?: number | string;
  zoom?: number;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  latitude,
  longitude,
  accuracy,
  popupHtml,
  height = 400,
  zoom = 17,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || typeof L === 'undefined') return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([latitude, longitude], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    // Invalidate size after mount (modal may animate in)
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof L === 'undefined') return;

    const latlng: [number, number] = [latitude, longitude];

    if (!markerRef.current) {
      markerRef.current = L.marker(latlng).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }

    if (popupHtml) {
      markerRef.current.bindPopup(popupHtml);
    }

    if (accuracy != null && accuracy > 0) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: accuracy,
          color: '#10B981',
          fillColor: '#10B981',
          fillOpacity: 0.15,
          weight: 1,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(accuracy);
      }
    } else if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    map.setView(latlng, map.getZoom() || zoom, { animate: true });
  }, [latitude, longitude, accuracy, popupHtml, zoom]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
};

export default LeafletMap;
