export const CITY_STORAGE_KEY = 'website_selected_city_id';
export const CITY_NAME_STORAGE_KEY = 'website_selected_city_name';

export interface StoredCity {
  id: string;
  name: string;
  province?: string;
}

export function getSelectedCityId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CITY_STORAGE_KEY);
}

export function getSelectedCityName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CITY_NAME_STORAGE_KEY);
}

export function getStoredCity(): StoredCity | null {
  const id = getSelectedCityId();
  if (!id) return null;
  return {
    id,
    name: getSelectedCityName() || 'Your city',
  };
}

export function setSelectedCity(city: StoredCity): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CITY_STORAGE_KEY, city.id);
  localStorage.setItem(CITY_NAME_STORAGE_KEY, city.name);
}

export function clearSelectedCity(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CITY_STORAGE_KEY);
  localStorage.removeItem(CITY_NAME_STORAGE_KEY);
}

export function hasSelectedCity(): boolean {
  return Boolean(getSelectedCityId());
}

/** Match saved address city name to the customer's selected service city. */
export function addressMatchesSelectedCity(
  addressCity: string | null | undefined,
  selectedCityName: string | null | undefined
): boolean {
  if (!selectedCityName) return true;
  if (!addressCity) return false;
  return addressCity.trim().toLowerCase() === selectedCityName.trim().toLowerCase();
}
