import { addressMatchesSelectedCity } from '@/lib/cityStorage';

/** Match an entity to the currently selected service city (by id and/or name). */
export function matchesSelectedCity(
  entity: { cityId?: string | null; city?: string | null },
  selectedCityId: string | null | undefined,
  selectedCityName: string | null | undefined
): boolean {
  if (selectedCityId && entity.cityId) {
    return entity.cityId === selectedCityId;
  }
  if (selectedCityName && entity.city) {
    return addressMatchesSelectedCity(entity.city, selectedCityName);
  }
  // No city metadata — hide when a city is selected (safer than showing mixed data).
  if (selectedCityId || selectedCityName) return false;
  return true;
}
