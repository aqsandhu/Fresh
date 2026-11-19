/** A time slot as /orders/time-slots answers (keys camel-cased by the API client). */
export interface WaSlot {
  id: string;
  slotName?: string;
  startTime?: string;
  endTime?: string;
  availableSlots?: number;
  isFreeDeliverySlot?: boolean;
}

/** /site-settings/delivery (camel-cased). */
export interface WaDeliverySettings {
  baseCharge?: number;
  freeDeliveryThreshold?: number;
  urgentCharge?: number;
  urgentEta?: string;
  urgentEnabled?: boolean;
}
