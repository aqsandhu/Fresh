// The admin "Track rider" popup (moved out of pages/Orders.tsx, W21): the
// rider's live position — first loaded on open, then socket pushes with a
// 5-second poll as the fallback. Mounted per opening.
import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { GoogleMarkerMap } from '@/components/ui/GoogleMarkerMap';
import { riderService } from '@/services/rider.service';
import { offSocketEvent, onSocketEvent } from '@/services/socket';
import { esc } from '@/lib/escape';
import toast from 'react-hot-toast';

export const RiderTrackingModal: React.FC<{
  riderId: string;
  riderName: string;
  onClose: () => void;
}> = ({ riderId: trackingRiderId, riderName: trackingRiderName, onClose }) => {
  const [riderLocation, setRiderLocation] = useState<{ latitude: number | null; longitude: number | null; accuracy?: number | null; locationUpdatedAt: string | null } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);

  // First position as soon as the popup opens.
  useEffect(() => {
    let live = true;
    riderService
      .getRiderLocation(trackingRiderId)
      .then((loc) => { if (live) setRiderLocation(loc); })
      .catch(() => { if (live) toast.error('Failed to load rider location'); })
      .finally(() => { if (live) setLoadingLocation(false); });
    return () => { live = false; };
  }, [trackingRiderId]);

  // Auto-refresh rider location every 5 seconds as a fallback to socket pushes.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const loc = await riderService.getRiderLocation(trackingRiderId);
        setRiderLocation(loc);
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [trackingRiderId]);

  useEffect(() => {
    const handleRiderLocation = (payload: any) => {
      if (payload?.riderId !== trackingRiderId) return;
      const latitude = Number(payload.latitude);
      const longitude = Number(payload.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      setRiderLocation({
        latitude,
        longitude,
        accuracy: payload.accuracy ?? null,
        locationUpdatedAt: payload.updatedAt || new Date().toISOString(),
      });
    };
    onSocketEvent('rider:location', handleRiderLocation);
    return () => offSocketEvent('rider:location', handleRiderLocation);
  }, [trackingRiderId]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Track Rider: ${trackingRiderName}`}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {loadingLocation ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      ) : riderLocation?.latitude && riderLocation?.longitude ? (
        <div className="space-y-4">
          <div className="rounded-lg overflow-hidden border" style={{ height: 400 }}>
            <GoogleMarkerMap
              latitude={riderLocation.latitude}
              longitude={riderLocation.longitude}
              accuracy={riderLocation.accuracy ?? null}
              popupHtml={`<b>${esc(trackingRiderName || 'Rider')}</b><br/>${riderLocation.accuracy != null ? `Accuracy: +/-${riderLocation.accuracy.toFixed(1)} m` : ''}`}
              height={400}
            />
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div className="text-sm">
              <p className="font-medium">{trackingRiderName}</p>
              <p className="text-gray-500">
                Last updated: {riderLocation.locationUpdatedAt ? new Date(riderLocation.locationUpdatedAt).toLocaleTimeString() : 'N/A'}
                {riderLocation.accuracy != null && (
                  <span> - Accuracy: +/-{riderLocation.accuracy.toFixed(1)} m</span>
                )}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps?q=${riderLocation.latitude},${riderLocation.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:underline"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Location data not available for this rider.</p>
        </div>
      )}
    </Modal>
  );
};
