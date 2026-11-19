/** localStorage key for super-admin city filter — used by CityContext + api interceptor. */
export const CITY_STORAGE_KEY = 'admin_selected_city_id';

/** Forget the choice entirely (logout): the next sign-in starts on the default city. */
export function clearCitySelection(): void {
  localStorage.removeItem(CITY_STORAGE_KEY);
}

/**
 * Remember the city the admin works in. '' is a real choice — "All cities" —
 * and is stored as '' (G28: it used to be REMOVED, which reads as "never
 * chosen", so a reload snapped the super admin back to Gujrat). The API client
 * sends no X-City-Id for ''.
 */
export function setCitySelection(cityId: string): void {
  localStorage.setItem(CITY_STORAGE_KEY, cityId);
}
