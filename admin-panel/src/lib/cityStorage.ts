/** localStorage key for super-admin city filter — used by CityContext + api interceptor. */
export const CITY_STORAGE_KEY = 'admin_selected_city_id';

export function clearCitySelection(): void {
  localStorage.removeItem(CITY_STORAGE_KEY);
}

export function setCitySelection(cityId: string): void {
  if (cityId) {
    localStorage.setItem(CITY_STORAGE_KEY, cityId);
  } else {
    localStorage.removeItem(CITY_STORAGE_KEY);
  }
}
