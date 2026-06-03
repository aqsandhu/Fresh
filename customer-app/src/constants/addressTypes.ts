export const ADDRESS_TYPES = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
] as const;

export type AddressTypeValue = (typeof ADDRESS_TYPES)[number]['value'];

export function normalizeAddressType(raw?: string): AddressTypeValue {
  const lower = (raw || 'home').toLowerCase();
  return ADDRESS_TYPES.some((t) => t.value === lower) ? (lower as AddressTypeValue) : 'home';
}

export function getAddressTypeLabel(raw?: string): string {
  const normalized = normalizeAddressType(raw);
  return ADDRESS_TYPES.find((t) => t.value === normalized)?.label || 'Home';
}
