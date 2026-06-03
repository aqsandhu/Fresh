import { useEffect, useRef, useState } from 'react';
import type MapView from 'react-native-maps';

export const DEFAULT_MAP_DELTA = 0.008;

export function useMapRegionSync(lat: number, lng: number, latitudeDelta = DEFAULT_MAP_DELTA) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta,
        longitudeDelta: latitudeDelta,
      },
      350
    );
  }, [lat, lng, latitudeDelta, mapReady]);

  const onMapReady = () => {
    setMapReady(true);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRef.current?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta,
          longitudeDelta: latitudeDelta,
        },
        0
      );
    }
  };

  return { mapRef, onMapReady, mapReady };
}
