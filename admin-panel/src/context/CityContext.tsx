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
import { CITY_STORAGE_KEY, setCitySelection } from '@/lib/cityStorage';

export interface ServiceCity {
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
  const isScopedAdmin = user?.role === 'admin' && Boolean(user?.adminRoleId);
  const isLegacyAdmin = user?.role === 'admin' && !user?.adminRoleId;
  const canSwitchCity = isSuperAdmin || isLegacyAdmin;
  const lockedCityId = isScopedAdmin ? (user?.adminRoleCityId ?? '') : '';
  const isCityLocked = isScopedAdmin && Boolean(lockedCityId || user?.adminRoleCity);

  const [selectedCityId, setSelectedCityIdState] = useState<string>(() => {
    if (lockedCityId) return lockedCityId;
    return localStorage.getItem(CITY_STORAGE_KEY) ?? '';
  });

  const {
    data: allCities = [],
    isLoading,
    isError: citiesError,
  } = useQuery<ServiceCity[]>({
    queryKey: ['service-cities', user?.id, lockedCityId],
    queryFn: fetchServiceCities,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const cities = useMemo(() => {
    if (!isScopedAdmin) return allCities;

    if (lockedCityId) {
      const match = allCities.filter((c) => c.id === lockedCityId);
      if (match.length > 0) return match;
    }

    if (user?.adminRoleCity) {
      return [
        {
          id: lockedCityId || 'role-city',
          name: user.adminRoleCity,
          province: '',
          isActive: true,
        },
      ];
    }

    return [];
  }, [allCities, isScopedAdmin, lockedCityId, user?.adminRoleCity]);

  const setSelectedCityId = useCallback(
    (id: string) => {
      if (isCityLocked) return;

      setSelectedCityIdState(id);
      setCitySelection(id);

      const label =
        id === ''
          ? 'All cities'
          : cities.find((c) => c.id === id)?.name || 'Selected city';
      toast.success(`Viewing: ${label}`);

      queryClient.invalidateQueries();
    },
    [isCityLocked, queryClient, cities]
  );

  useEffect(() => {
    initDone.current = false;
  }, [user?.id, lockedCityId]);

  useEffect(() => {
    if (isScopedAdmin) {
      const id = lockedCityId || cities[0]?.id || '';
      if (id) {
        setSelectedCityIdState(id);
        setCitySelection(id);
      }
      return;
    }

    if (allCities.length === 0 || initDone.current) return;

    initDone.current = true;
    const stored = localStorage.getItem(CITY_STORAGE_KEY);

    if (stored === '') {
      setSelectedCityIdState('');
      return;
    }
    if (stored && allCities.some((c) => c.id === stored)) {
      setSelectedCityIdState(stored);
      return;
    }

    const gujrat = findDefaultCity(allCities);
    if (gujrat) {
      setSelectedCityIdState(gujrat.id);
      setCitySelection(gujrat.id);
    }
  }, [isScopedAdmin, lockedCityId, allCities, cities]);

  // '' is a valid super-admin selection ("All cities") — never coerce it to a
  // real city, otherwise picking "All cities" snaps back to cities[0] (Gujrat).
  const selectedCity = useMemo(
    () => (selectedCityId ? cities.find((c) => c.id === selectedCityId) ?? null : null),
    [cities, selectedCityId]
  );

  const value = useMemo(
    () => ({
      cities,
      selectedCityId,
      selectedCity,
      setSelectedCityId,
      canSwitchCity,
      isCityLocked,
      isLoading,
      citiesError,
    }),
    [
      cities,
      selectedCityId,
      selectedCity,
      setSelectedCityId,
      canSwitchCity,
      isCityLocked,
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
