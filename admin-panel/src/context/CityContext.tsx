import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/services/api';
import { useAuthContext } from '@/context/AuthContext';
import { CITY_STORAGE_KEY } from '@/lib/cityStorage';
  id: string;
  name: string;
  province: string;
  isActive: boolean;
}

interface CityContextValue {
  cities: ServiceCity[];
  selectedCityId: string;
  selectedCity: ServiceCity | null;
  setSelectedCityId: (id: string) => void;
  canSwitchCity: boolean;
  isCityLocked: boolean;
  isLoading: boolean;
  citiesError: boolean;
}

/** Shared with api.ts request interceptor — keep in sync. */
export const CITY_STORAGE_KEY = 'admin_selected_city_id';

/** Seeded catalog/orders live under Gujrat after migration 04 backfill. */
function findDefaultCity(cities: ServiceCity[]): ServiceCity | undefined {
  return (
    cities.find((c) => c.name.toLowerCase() === 'gujrat') ||
    cities.find((c) => c.isActive) ||
    cities[0]
  );
}

async function fetchServiceCities(): Promise<ServiceCity[]> {
  try {
    const res: any = await api.get('/admin/cities');
    const list = res?.data;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {
    /* try public fallback below */
  }

  try {
    const pub: any = await api.get('/site-settings/cities');
    const list = pub?.data;
    if (Array.isArray(list)) {
      return list.map((c: ServiceCity) => ({
        ...c,
        isActive: c.isActive ?? true,
      }));
    }
  } catch {
    /* both failed */
  }

  return [];
}

const CityContext = createContext<CityContextValue | undefined>(undefined);

export const CityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const initDone = useRef(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const isLegacyAdmin = user?.role === 'admin';
  const canSwitchCity = isSuperAdmin || isLegacyAdmin;
  const lockedCityId =
    !canSwitchCity && user?.adminRoleCityId ? user.adminRoleCityId : '';

  const [selectedCityId, setSelectedCityIdState] = useState<string>(() => {
    if (lockedCityId) return lockedCityId;
    return localStorage.getItem(CITY_STORAGE_KEY) ?? '';
  });

  const {
    data: cities = [],
    isLoading,
    isError: citiesError,
  } = useQuery<ServiceCity[]>({
    queryKey: ['service-cities'],
    queryFn: fetchServiceCities,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const setSelectedCityId = useCallback(
    (id: string) => {
      if (lockedCityId) return;

      setSelectedCityIdState(id);
      localStorage.setItem(CITY_STORAGE_KEY, id);

      const label =
        id === ''
          ? 'All cities'
          : cities.find((c) => c.id === id)?.name || 'Selected city';
      toast.success(`Viewing: ${label}`);

      queryClient.invalidateQueries();
    },
    [lockedCityId, queryClient, cities]
  );

  // One-time init after cities load — never override user picks afterward.
  useEffect(() => {
    if (lockedCityId) {
      setSelectedCityIdState(lockedCityId);
      return;
    }
    if (cities.length === 0 || initDone.current) return;

    initDone.current = true;
    const stored = localStorage.getItem(CITY_STORAGE_KEY);

    if (stored === '') {
      setSelectedCityIdState('');
      return;
    }
    if (stored && cities.some((c) => c.id === stored)) {
      setSelectedCityIdState(stored);
      return;
    }

    const gujrat = findDefaultCity(cities);
    if (gujrat) {
      setSelectedCityIdState(gujrat.id);
      localStorage.setItem(CITY_STORAGE_KEY, gujrat.id);
    }
  }, [lockedCityId, cities]);

  const selectedCity = useMemo(
    () => cities.find((c) => c.id === selectedCityId) || null,
    [cities, selectedCityId]
  );

  const value = useMemo(
    () => ({
      cities,
      selectedCityId,
      selectedCity,
      setSelectedCityId,
      canSwitchCity,
      isCityLocked: Boolean(lockedCityId),
      isLoading,
      citiesError,
    }),
    [
      cities,
      selectedCityId,
      selectedCity,
      setSelectedCityId,
      canSwitchCity,
      lockedCityId,
      isLoading,
      citiesError,
    ]
  );

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
};

export function useCityContext(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) {
    throw new Error('useCityContext must be used within CityProvider');
  }
  return ctx;
}
