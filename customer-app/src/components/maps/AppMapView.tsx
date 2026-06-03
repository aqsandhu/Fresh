import React from 'react';
import MapView, { MapViewProps, PROVIDER_GOOGLE } from 'react-native-maps';
import { getMapUnavailableReason, shouldUseGoogleMapsProvider } from '@/lib/googleMaps';
import { MapUnavailableFallback } from './MapUnavailableFallback';

export type AppMapViewProps = MapViewProps;

/**
 * Map with correct provider and fallbacks when Google tiles cannot load.
 */
export const AppMapView: React.FC<AppMapViewProps> = ({ style, children, ...rest }) => {
  const unavailable = getMapUnavailableReason();

  if (unavailable) {
    return <MapUnavailableFallback style={style} reason={unavailable} />;
  }

  const provider = shouldUseGoogleMapsProvider() ? PROVIDER_GOOGLE : undefined;

  return (
    <MapView provider={provider} style={style} {...rest}>
      {children}
    </MapView>
  );
};

export default AppMapView;
