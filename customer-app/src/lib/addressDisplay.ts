import { Address } from '@app-types';
import { getAddressTypeLabel } from '@/constants/addressTypes';

/** Address fields normalized by address.service (camelCase). */
export type CheckoutAddress = Address & {
  fullAddress?: string;
  label?: string;
};

export function formatAddressLine(addr: CheckoutAddress): string {
  const parts = [addr.writtenAddress, addr.areaName, addr.city].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return addr.fullAddress || '';
}

export function addressTypeLabel(addr: CheckoutAddress): string {
  return getAddressTypeLabel(addr.label || addr.addressType);
}
