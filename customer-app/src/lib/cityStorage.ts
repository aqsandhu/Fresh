import AsyncStorage from '@react-native-async-storage/async-storage';

export const CITY_STORAGE_KEY = '@freshbazar_selected_city_id';
export const CITY_NAME_STORAGE_KEY = '@freshbazar_selected_city_name';

export interface StoredCity {
  id: string;
  name: string;
  province?: string;
}

export async function getSelectedCityId(): Promise<string | null> {
  return AsyncStorage.getItem(CITY_STORAGE_KEY);
}

export async function getSelectedCityName(): Promise<string | null> {
  return AsyncStorage.getItem(CITY_NAME_STORAGE_KEY);
}

export async function getStoredCity(): Promise<StoredCity | null> {
  const id = await getSelectedCityId();
  if (!id) return null;
  const name = (await getSelectedCityName()) || 'Your city';
  return { id, name };
}

export async function setSelectedCity(city: StoredCity): Promise<void> {
  await AsyncStorage.setItem(CITY_STORAGE_KEY, city.id);
  await AsyncStorage.setItem(CITY_NAME_STORAGE_KEY, city.name);
}

export async function clearSelectedCity(): Promise<void> {
  await AsyncStorage.multiRemove([CITY_STORAGE_KEY, CITY_NAME_STORAGE_KEY]);
}

export async function hasSelectedCity(): Promise<boolean> {
  const id = await getSelectedCityId();
  return Boolean(id);
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
