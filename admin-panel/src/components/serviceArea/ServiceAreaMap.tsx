import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/loadGoogleMaps';
import type { LngLat } from '@/services/serviceArea.service';

interface ServiceAreaMapProps {
  /** Boundary as [lng, lat] points. */
  polygon: LngLat[];
  onChange: (polygon: LngLat[]) => void;
  height?: number;
}

// Default center: Gujrat, Pakistan (first launch city).
const DEFAULT_CENTER = { lat: 32.5742, lng: 74.0789 };

/**
 * Interactive Google Maps polygon editor. Click the map to add boundary points,
 * drag points to adjust. Falls back to a notice when no Maps key is configured
 * (the parent page still offers a manual coordinates box).
 */
export const ServiceAreaMap: React.FC<ServiceAreaMapProps> = ({
  polygon,
  onChange,
  height = 420,
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const polyRef = useRef<any>(null);
  const mapsRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const readPath = (): LngLat[] => {
    const poly = polyRef.current;
    if (!poly) return [];
    const path = poly.getPath();
    const out: LngLat[] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i);
      out.push([p.lng(), p.lat()]);
    }
    return out;
  };

  const emit = () => onChangeRef.current(readPath());

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return;
        if (!maps || !divRef.current) {
          setStatus('unavailable');
          return;
        }
        mapsRef.current = maps;
        const map = new maps.Map(divRef.current, {
          center: polygon.length
            ? { lat: polygon[0][1], lng: polygon[0][0] }
            : DEFAULT_CENTER,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;

        const poly = new maps.Polygon({
          paths: polygon.map(([lng, lat]) => ({ lat, lng })),
          editable: true,
          strokeColor: '#16a34a',
          strokeWeight: 2,
          fillColor: '#16a34a',
          fillOpacity: 0.15,
        });
        poly.setMap(map);
        polyRef.current = poly;

        const path = poly.getPath();
        ['insert_at', 'set_at', 'remove_at'].forEach((ev) =>
          maps.event.addListener(path, ev, emit)
        );
        maps.event.addListener(map, 'click', (e: any) => {
          poly.getPath().push(e.latLng);
          emit();
        });

        if (polygon.length >= 1) {
          const bounds = new maps.LatLngBounds();
          polygon.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
          map.fitBounds(bounds);
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when the polygon prop changes from outside (city switch / manual box).
  useEffect(() => {
    const maps = mapsRef.current;
    const poly = polyRef.current;
    if (!maps || !poly) return;
    const current = readPath();
    const same =
      current.length === polygon.length &&
      current.every((p, i) => p[0] === polygon[i][0] && p[1] === polygon[i][1]);
    if (same) return;
    poly.setPath(polygon.map(([lng, lat]) => ({ lat, lng })));
    if (polygon.length) {
      const bounds = new maps.LatLngBounds();
      polygon.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
      mapRef.current?.fitBounds(bounds);
    }
  }, [polygon]);

  const clear = () => {
    polyRef.current?.setPath([]);
    emit();
  };
  const undo = () => {
    const path = polyRef.current?.getPath();
    if (path && path.getLength() > 0) {
      path.removeAt(path.getLength() - 1);
      emit();
    }
  };

  if (status === 'unavailable') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Interactive map is unavailable (no Google Maps browser key configured on the
        backend). You can still define the boundary using the coordinates box below.
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div ref={divRef} style={{ height }} className="w-full rounded-lg border border-gray-200" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 rounded-lg text-sm text-gray-500">
            Loading map…
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={undo}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
        >
          Undo point
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
        >
          Clear
        </button>
        <span className="text-gray-500">
          Click the map to add boundary points; drag points to fine-tune.
        </span>
      </div>
    </div>
  );
};

export default ServiceAreaMap;
