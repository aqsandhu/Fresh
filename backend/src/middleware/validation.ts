// ============================================================================
// REQUEST VALIDATION MIDDLEWARE
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import Joi, { ObjectSchema, ValidationError as JoiValidationError } from 'joi';
import { ValidationError } from './errorHandler';
import { isOtpBypassEnabled } from '../config/otpBypass';

// Validation source types
type ValidationSource = 'body' | 'query' | 'params' | 'headers' | 'cookies';

// Validation middleware factory
export const validate = (
  schema: ObjectSchema,
  source: ValidationSource = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dataToValidate = req[source];
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: source === 'headers',
    });
    
    if (error) {
      const errors = formatJoiErrors(error);
      next(new ValidationError('Validation failed', errors));
      return;
    }
    
    // Replace request data with validated value
    req[source] = value;
    next();
  };
};

// Format Joi errors
const formatJoiErrors = (error: JoiValidationError): any[] => {
  return error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message,
    value: detail.context?.value,
  }));
};

// Common validation schemas
export const commonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid(),
  
  // Phone number validation (Pakistani)
  phone: Joi.string().pattern(/^(\+92|0)[0-9]{10}$/).messages({
    'string.pattern.base': 'Phone number must be a valid Pakistani number (e.g., +923001234567 or 03001234567)',
  }),
  
  // Email validation
  email: Joi.string().email().lowercase().trim(),
  
  // Password validation
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
  
  // Name validation
  name: Joi.string().min(2).max(100).trim(),
  
  // Coordinate validation
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  
  // Price validation
  price: Joi.number().min(0).max(999999.99),
  
  // Quantity validation
  quantity: Joi.number().integer().min(1).max(9999),
  
  // Pagination
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  
  // Sorting
  sortBy: Joi.string().valid('created_at', 'price', 'name', 'popularity'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  
  // Search
  search: Joi.string().min(1).max(100).trim(),
};

const otpCodeField = Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
  'string.length': 'OTP must be exactly 6 digits',
  'string.pattern.base': 'OTP must contain only digits',
  'any.required': 'OTP code is required',
});

function buildVerifyLoginSchema(): ObjectSchema {
  if (isOtpBypassEnabled()) {
    return Joi.object({
      phone: commonSchemas.phone.required(),
      code: otpCodeField,
    });
  }
  return Joi.object({
    idToken: Joi.string().min(100).required().messages({
      'string.min': 'Invalid verification token',
      'any.required': 'Verification token is required',
    }),
  });
}

function buildVerifyRegisterSchema(): ObjectSchema {
  if (isOtpBypassEnabled()) {
    return Joi.object({
      phone: commonSchemas.phone.required(),
      code: otpCodeField,
      full_name: commonSchemas.name.required(),
      email: commonSchemas.email,
      password: commonSchemas.password.optional(),
    });
  }
  return Joi.object({
    idToken: Joi.string().min(100).required().messages({
      'string.min': 'Invalid verification token',
      'any.required': 'Verification token is required',
    }),
    full_name: commonSchemas.name.required(),
    email: commonSchemas.email,
    password: commonSchemas.password.optional(),
  });
}

function buildResetPinConfirmSchema(): ObjectSchema {
  if (isOtpBypassEnabled()) {
    return Joi.object({
      phone: commonSchemas.phone.required(),
      code: otpCodeField,
      newPin: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
        'string.length': 'PIN must be exactly 4 digits',
        'string.pattern.base': 'PIN must contain only digits (0-9)',
      }),
    });
  }
  return Joi.object({
    idToken: Joi.string().min(100).required().messages({
      'string.min': 'Invalid Firebase verification token',
      'any.required': 'Verification token is required',
    }),
    newPin: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
      'string.length': 'PIN must be exactly 4 digits',
      'string.pattern.base': 'PIN must contain only digits (0-9)',
    }),
  });
}

// Auth validation schemas
export const authSchemas = {
  sendOtp: Joi.object({
    phone: commonSchemas.phone.required(),
  }),

  get verifyLogin() {
    return buildVerifyLoginSchema();
  },

  get verifyRegister() {
    return buildVerifyRegisterSchema();
  },

  register: Joi.object({
    phone: commonSchemas.phone.required(),
    full_name: commonSchemas.name.required(),
    email: commonSchemas.email,
    password: commonSchemas.password.required(),
  }),
  
  login: Joi.object({
    phone: commonSchemas.phone.required(),
    password: Joi.string().required(),
  }),
  
  // Website sends an EMPTY body — its refresh token lives in an HttpOnly
  // cookie that the controller reads via getRefreshTokenFromRequest. Requiring
  // a body token here would 400 every cookie-mode refresh and force-log-out
  // browser sessions as soon as the access token expires. Mobile/admin still
  // send the token in the body; a missing token everywhere yields the
  // controller's own 401.
  refresh: Joi.object({
    refreshToken: Joi.string(),
    refresh_token: Joi.string(),
  }),
  
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required(),
  }),

  // ─── 4-digit PIN flow ──────────────────────────────────────────────────
  // Common shape: PIN is exactly 4 digits, no other characters.
  pinStatus: Joi.object({
    phone: commonSchemas.phone.required(),
  }),

  setPin: Joi.object({
    pin: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
      'string.length': 'PIN must be exactly 4 digits',
      'string.pattern.base': 'PIN must contain only digits (0-9)',
      'any.required': 'PIN is required',
    }),
  }),

  // Used both for normal PIN login and for the in-session re-auth at
  // checkout (only `pin` matters there but we still take phone for the
  // login case so we can look up the user without an active token).
  verifyPin: Joi.object({
    phone: commonSchemas.phone.required(),
    pin: Joi.string().length(4).pattern(/^\d{4}$/).required().messages({
      'string.length': 'PIN must be exactly 4 digits',
      'string.pattern.base': 'PIN must contain only digits (0-9)',
    }),
  }),

  get resetPinConfirm() {
    return buildResetPinConfirmSchema();
  },
};

// Product validation schemas
export const productSchemas = {
  list: Joi.object({
    category: commonSchemas.uuid,
    search: commonSchemas.search,
    minPrice: commonSchemas.price,
    maxPrice: commonSchemas.price,
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    sortBy: commonSchemas.sortBy,
    sortOrder: commonSchemas.sortOrder,
    featured: Joi.boolean(),
    inStock: Joi.boolean(),
  }),
  
  create: Joi.object({
    name_ur: Joi.string().min(2).max(255).allow('', null),
    name_en: Joi.string().min(2).max(255).required(),
    category_id: commonSchemas.uuid.required(),
    subcategory_id: commonSchemas.uuid,
    price: commonSchemas.price.required(),
    compare_at_price: commonSchemas.price.allow(null, 0),
    // Optional per-unit overrides. NULL => derive from `price`.
    half_kg_price: commonSchemas.price.allow(null, '', 0).optional(),
    quarter_kg_price: commonSchemas.price.allow(null, '', 0).optional(),
    half_dozen_price: commonSchemas.price.allow(null, '', 0).optional(),
    unit_type: Joi.string().valid('kg', 'gram', 'piece', 'dozen', 'liter', 'ml', 'pack').default('kg'),
    unit_value: Joi.number().positive().default(1),
    stock_quantity: Joi.number().integer().min(0).default(0),
    description_ur: Joi.string().allow('', null),
    description_en: Joi.string().allow('', null),
    is_active: Joi.boolean().default(true),
    is_featured: Joi.boolean().default(false),
    is_new_arrival: Joi.boolean().default(false),
    is_variable_weight: Joi.boolean().default(false),
    variable_weight_note: Joi.string().allow('', null).max(1000).optional(),
    allow_half_kg: Joi.boolean().optional(),
    allow_quarter_kg: Joi.boolean().optional(),
    tags: Joi.array().items(Joi.string().trim().min(1).max(100)).optional(),
  }),

  update: Joi.object({
    name_ur: Joi.string().min(2).max(255).allow('', null),
    name_en: Joi.string().min(2).max(255),
    category_id: commonSchemas.uuid,
    subcategory_id: commonSchemas.uuid,
    price: commonSchemas.price,
    compare_at_price: commonSchemas.price.allow(null, 0),
    half_kg_price: commonSchemas.price.allow(null, '', 0).optional(),
    quarter_kg_price: commonSchemas.price.allow(null, '', 0).optional(),
    half_dozen_price: commonSchemas.price.allow(null, '', 0).optional(),
    unit_type: Joi.string().valid('kg', 'gram', 'piece', 'dozen', 'liter', 'ml', 'pack'),
    unit_value: Joi.number().positive(),
    stock_quantity: Joi.number().integer().min(0),
    description_ur: Joi.string().allow('', null),
    description_en: Joi.string().allow('', null),
    is_active: Joi.boolean(),
    is_featured: Joi.boolean(),
    is_new_arrival: Joi.boolean(),
    is_variable_weight: Joi.boolean(),
    variable_weight_note: Joi.string().allow('', null).max(1000).optional(),
    allow_half_kg: Joi.boolean().optional(),
    allow_quarter_kg: Joi.boolean().optional(),
    tags: Joi.array().items(Joi.string().trim().min(1).max(100)).optional(),
  }),
};

// Cart validation schemas
export const cartSchemas = {
  addItem: Joi.object({
    product_id: commonSchemas.uuid.required(),
    quantity: commonSchemas.quantity.required(),
    unit: Joi.string().valid('full', 'half_kg', 'quarter_kg', 'half_dozen').default('full'),
    special_instructions: Joi.string().max(500),
  }),

  // POST /api/cart/sync — atomic replace of the server cart.
  sync: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          product_id: commonSchemas.uuid.required(),
          quantity: commonSchemas.quantity.required(),
          unit: Joi.string().valid('full', 'half_kg', 'quarter_kg', 'half_dozen').default('full'),
        })
      )
      .min(1)
      .max(100)
      .required(),
  }),
  
  updateItem: Joi.object({
    quantity: commonSchemas.quantity.required(),
  }),
  
  removeItem: Joi.object({
    product_id: commonSchemas.uuid.required(),
  }),
  
  deliveryCharge: Joi.object({
    time_slot_id: commonSchemas.uuid,
  }),
};

// Address validation schemas — multipart form sends strings; coerce booleans/numbers.
const formBoolean = Joi.boolean().truthy('true', '1', 1).falsy('false', '0', 0);
const formNumber = Joi.number().empty('').allow(null);

export const addressSchemas = {
  create: Joi.object({
    address_type: Joi.string().valid('home', 'work', 'office', 'other').default('home'),
    written_address: Joi.string().min(5).max(500).required(),
    landmark: Joi.string().allow('').max(255).default(''),
    latitude: formNumber.optional(),
    longitude: formNumber.optional(),
    area_name: Joi.string().max(255).allow('').default('N/A'),
    city: Joi.string().max(100).default('Gujrat'),
    province: Joi.string().max(100).default('Punjab'),
    postal_code: Joi.string().max(20).allow('').empty(''),
    is_default: formBoolean.default(false),
    delivery_instructions: Joi.string().max(1000).allow('').empty(''),
    location_accuracy: formNumber.optional(),
  }).prefs({ convert: true }),
  
  update: Joi.object({
    address_type: Joi.string().valid('home', 'work', 'office', 'other'),
    written_address: Joi.string().min(5).max(500),
    landmark: Joi.string().allow('').max(255),
    latitude: commonSchemas.latitude.optional().allow(null),
    longitude: commonSchemas.longitude.optional().allow(null),
    area_name: Joi.string().max(255),
    city: Joi.string().max(100),
    province: Joi.string().max(100),
    postal_code: Joi.string().max(20),
    is_default: Joi.boolean(),
    delivery_instructions: Joi.string().max(1000),
    location_accuracy: formNumber.optional(),
  }),
};

// Order validation schemas
export const orderSchemas = {
  // GET /api/orders query — clamps page/limit (an unbounded limit was a
  // free heavy-query lever) and whitelists status against the enum.
  list: Joi.object({
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    status: Joi.string().valid(
      'pending', 'confirmed', 'preparing', 'ready_for_pickup',
      'out_for_delivery', 'delivered', 'cancelled', 'refunded'
    ),
    city_id: commonSchemas.uuid,
  }),

  create: Joi.object({
    address_id: commonSchemas.uuid.required(),
    time_slot_id: commonSchemas.uuid,
    requested_delivery_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    payment_method: Joi.string().valid('cash_on_delivery', 'card', 'easypaisa', 'jazzcash').default('cash_on_delivery'),
    customer_notes: Joi.string().allow('').max(1000),
    urgent_delivery: Joi.boolean().default(false),
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid(
      'pending', 'confirmed', 'preparing', 'ready_for_pickup',
      'out_for_delivery', 'delivered', 'cancelled'
    ).required(),
    reason: Joi.string().allow('').max(500),
  }),
  
  assignRider: Joi.object({
    rider_id: commonSchemas.uuid.required(),
  }),
};

// Atta request validation schemas
export const attaSchemas = {
  create: Joi.object({
    address_id: commonSchemas.uuid.required(),
    wheat_quality: Joi.string().valid('desi', 'imported', 'mixed').default('desi'),
    wheat_quantity_kg: Joi.number().positive().max(1000).required(),
    wheat_description: Joi.string().max(500),
    flour_type: Joi.string().valid('fine', 'medium', 'coarse').default('fine'),
    special_instructions: Joi.string().max(1000),
  }),
  
  updateStatus: Joi.object({
    status: Joi.string().valid(
      'pending_pickup', 'picked_up', 'at_mill', 'milling',
      'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'
    ).required(),
  }),
};

// Rider validation schemas
export const riderSchemas = {
  updateLocation: Joi.object({
    latitude: commonSchemas.latitude.required(),
    longitude: commonSchemas.longitude.required(),
    accuracy: Joi.number().min(0).max(10000).optional(),
    timestamp: Joi.number().optional(),
  }),
  
  updateTaskStatus: Joi.object({
    status: Joi.string().valid('in_progress', 'completed', 'failed').required(),
    notes: Joi.string().max(500),
  }),
  
  callRequest: Joi.object({
    order_id: commonSchemas.uuid.required(),
  }),
};

// Admin validation schemas
export const adminSchemas = {
  // SECURITY FIX: Add admin login validation with password requirements
  adminLogin: Joi.object({
    phone: commonSchemas.phone.required(),
    password: Joi.string().min(6).max(128).required().messages({
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password must not exceed 128 characters',
      'any.required': 'Password is required',
    }),
  }),
  
  createProduct: productSchemas.create,
  updateProduct: productSchemas.update,
  
  createWhatsappOrder: Joi.object({
    whatsapp_number: commonSchemas.phone.required(),
    customer_name: Joi.string().max(255),
    items: Joi.array().items(
      Joi.object({
        product_id: commonSchemas.uuid.required(),
        quantity: commonSchemas.quantity.required(),
        unit: Joi.string().valid('full', 'half_kg', 'quarter_kg', 'half_dozen').default('full'),
        notes: Joi.string(),
      })
    ).min(1).required(),
    address_text: Joi.string().required(),
    latitude: commonSchemas.latitude.allow(null),
    longitude: commonSchemas.longitude.allow(null),
    delivery_charge: commonSchemas.price.default(0),
    admin_notes: Joi.string().allow('', null),
    // Optional link to an existing customer + their saved address.
    user_id: commonSchemas.uuid.optional().allow(null, ''),
    address_id: commonSchemas.uuid.optional().allow(null, ''),
    door_picture_url: Joi.string().uri().optional().allow(null, ''),
  }),

  assignHouseNumber: Joi.object({
    house_number: Joi.string().max(50).required(),
  }),

  bulkUpdateOrderStatus: Joi.object({
    order_ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    status: Joi.string().valid(
      'pending', 'confirmed', 'preparing', 'ready_for_pickup',
      'out_for_delivery', 'delivered', 'cancelled'
    ).required(),
    reason: Joi.string().max(500).allow('', null),
  }),
  
  updateOrderStatus: orderSchemas.updateStatus,
  assignRider: orderSchemas.assignRider,

  deleteCustomer: Joi.object({
    delete_orders: Joi.boolean().default(false),
    delete_addresses: Joi.boolean().default(false),
  }),
};
