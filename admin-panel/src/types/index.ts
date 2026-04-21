// ============================================================================
// Admin Panel Types — Re-exports from @freshbazar/shared-types + admin-specific
// ============================================================================

// Re-export ALL shared types (single source of truth)
export * from '@freshbazar/shared-types';

// ============================================================================
// Admin-panel-specific Types (NOT in shared-types — admin only)
// ============================================================================

/** Data required to create a new product */
export interface CreateProductData {
  nameEn: string;
  nameUr?: string;
  descriptionEn?: string;
  price: number;
  compareAtPrice?: number;
  stockQuantity: number;
  unitType: string;
  unitValue?: number;
  categoryId: string;
  images?: File[];
  isActive?: boolean;
  isFeatured?: boolean;
}

/** Data required to create a new category */
export interface CreateCategoryData {
  nameEn: string;
  nameUr: string;
  icon?: string;
  image?: File;
  isActive?: boolean;
  displayOrder?: number;
}

/** Data required to create a new rider */
export interface CreateRiderData {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  cnic: string;
  vehicleType: 'bike' | 'car' | 'van';
  vehicleNumber: string;
  drivingLicenseNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankAccountTitle?: string;
  bankAccountNumber?: string;
  bankName?: string;
}

/** Per-time-slot rider delivery charge override */
export interface RiderDeliveryCharge {
  timeSlotId: string;
  chargePerOrder: number;
}

/** WhatsApp order creation payload */
export interface WhatsAppOrderData {
  whatsappNumber: string;
  customerName: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  addressText: string;
  latitude?: number;
  longitude?: number;
  deliveryCharge?: number;
  adminNotes?: string;
}

/** Admin-specific order filter options */
export interface OrderFilters {
  status?: import('@freshbazar/shared-types').OrderStatus;
  startDate?: string;
  endDate?: string;
  riderId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Admin-specific product filter options */
export interface ProductFilters {
  categoryId?: string;
  search?: string;
  isActive?: boolean;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}
