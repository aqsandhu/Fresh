import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '@services/api';
import {
  getStoredCity,
  setSelectedCity as persistCity,
  type StoredCity,
} from '@/lib/cityStorage';
import { setCachedCityId } from '@/lib/apiHelpers';
import { useCartStore } from '@store/cartStore';

export interface ServiceCity {
  id: string;
  name: string;
  province: string;
}

interface CityContextValue {
  cities: ServiceCity[];
  selectedCity: StoredCity | null;
  selectedCityId: string | null;
  isLoading: boolean;
  isReady: boolean;
  setCity: (city: ServiceCity | StoredCity) => Promise<void>;
  reloadCities: () => Promise<void>;
}

const CityContext = createContext<CityContextValue | undefined>(undefined);

async function fetchCities(): Promise<ServiceCity[]> {
  try {
    const res = await apiClient.get('/site-settings/cities');
    const data = res.data?.data || res.data || [];
    if (!Array.isArray(data)) return [];
    return data.map((c: ServiceCity) => ({
      id: c.id,
      name: c.name,
      province: c.province || '',
    }));
  } catch {
    return [];
  }
}

export function CityProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const switchCartCity = useCartStore((s) => s.switchCity);

  const [cities, setCities] = useState<ServiceCity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [selectedCity, setSelectedCityState] = useState<StoredCity | null>(null);

  const reloadCities = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await fetchCities();
      setCities(list);
    } catch {
      setCities([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadCities().finally(async () => {
      const stored = await getStoredCity();
      setSelectedCityState(stored);
      setCachedCityId(stored?.id ?? null);
      if (stored?.id) {
        switchCartCity(stored.id);
      }
      setIsReady(true);
    });
  }, [reloadCities, switchCartCity]);

  const setCity = useCallback(
    async (city: ServiceCity | StoredCity) => {
      const next: StoredCity = {
        id: city.id,
        name: city.name,
        province: 'province' in city ? city.province : undefined,
      };
      await persistCity(next);
      setSelectedCityState(next);
      setCachedCityId(next.id);
      switchCartCity(next.id);
      queryClient.invalidateQueries();
    },
    [queryClient, switchCartCity]
  );

  const value = useMemo(
    () => ({
      cities,
      selectedCity,
      selectedCityId: selectedCity?.id ?? null,
      isLoading,
      isReady,
      setCity,
      reloadCities,
    }),
    [cities, selectedCity, isLoading, isReady, setCity, reloadCities]
  );

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export function useCityContext(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) {
    throw new Error('useCityContext must be used within CityProvider');
  }
  return ctx;
}

export function useOptionalCityName(): string {
  const ctx = useContext(CityContext);
  return ctx?.selectedCity?.name || 'Your city';
}
