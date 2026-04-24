import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * NetworkStatusBar — shows a sticky banner when the browser goes offline
 * or when backend API calls start failing (detected via a global flag set
 * by the API interceptor).
 */
export const NetworkStatusBar: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [backendDown, setBackendDown] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for custom events fired by api.ts when backend is unreachable
    const handleBackendDown = () => setBackendDown(true);
    const handleBackendUp = () => setBackendDown(false);
    window.addEventListener('backend-down', handleBackendDown);
    window.addEventListener('backend-up', handleBackendUp);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('backend-down', handleBackendDown);
      window.removeEventListener('backend-up', handleBackendUp);
    };
  }, []);

  const handleRetry = () => {
    setBackendDown(false);
    window.dispatchEvent(new CustomEvent('backend-retry'));
    window.location.reload();
  };

  if (isOnline && !backendDown) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-2 text-sm flex items-center justify-center gap-3 shadow-lg">
      <WifiOff className="w-4 h-4" />
      <span>
        {!isOnline
          ? 'You are offline. Please check your internet connection.'
          : 'Backend server is unavailable. Some features may not work.'}
      </span>
      <button
        onClick={handleRetry}
        className="inline-flex items-center gap-1 bg-white text-red-600 px-3 py-1 rounded-md text-xs font-semibold hover:bg-red-50 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </button>
    </div>
  );
};
