import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthContext } from '@/context/AuthContext';

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
  isSuperAdmin: boolean;
  isCityLocked: boolean;
  isLoading: boolean;
}

const STORAGE_KEY = 'admin_selected_city_id';

const CityContext = createContext<CityContextValue | undefined>(undefined);

export const CityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'super_admin';
  const lockedCityId = !isSuperAdmin ? user?.adminRoleCityId || '' : '';

  const [selectedCityId, setSelectedCityIdState] = useState<string>(() => {
    if (lockedCityId) return lockedCityId;
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  const { data: cities = [], isLoading } = useQuery<ServiceCity[]>({
    queryKey: ['service-cities'],
    queryFn: async () => {
      const res: any = await api.get('/admin/cities');
      return res?.data || [];
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const setSelectedCityId = useCallback(
    (id: string) => {
      if (lockedCityId) return;
      setSelectedCityIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
      queryClient.invalidateQueries();
    },
    [lockedCityId, queryClient]
  );

  useEffect(() => {
    if (lockedCityId) {
      setSelectedCityIdState(lockedCityId);
      return;
    }
    if (!selectedCityId && cities.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      const validStored = stored && cities.some((c) => c.id === stored);
      setSelectedCityIdState(validStored ? stored : cities[0].id);
    }
  }, [lockedCityId, cities, selectedCityId]);

  useEffect(() => {
    if (selectedCityId && !lockedCityId) {
      localStorage.setItem(STORAGE_KEY, selectedCityId);
    }
  }, [selectedCityId, lockedCityId]);

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
      isSuperAdmin,
      isCityLocked: Boolean(lockedCityId),
      isLoading,
    }),
    [
      cities,
      selectedCityId,
      selectedCity,
      setSelectedCityId,
      isSuperAdmin,
      lockedCityId,
      isLoading,
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
