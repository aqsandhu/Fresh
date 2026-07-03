// ============================================================================
// RESTAURANT CONTROLLER (public) — B2B registration + PIN login.
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  createdResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from '../utils/response';
import { generateRestaurantToken } from '../config/jwt';
import { emitToAdmins } from '../config/socket';
import { normalizePhoneNumber } from '../utils/validators';
import { hasRestaurantsTable } from '../config/restaurantSchema';
import logger from '../utils/logger';

const PIN_BCRYPT_ROUNDS = 10;

const DELETED_RESTAURANT_SNAPSHOT = {
  business_name: 'Deleted Restaurant',
  owner_name: null,
  phone: null,
  written_address: '',
  city: '',
  location: { latitude: null, longitude: null },
  front_image_url: null,
  is_restaurant: true,
  deleted_account: true,
};

async function anonymizeRestaurantAccount(restaurantId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const frontImageCol = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'restaurants'
          AND column_name = 'front_image_url'
        LIMIT 1`
    );
    const restaurantOrderCol = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'restaurant_id'
        LIMIT 1`
    );

    const sets = [
      `business_name = 'Deleted Restaurant'`,
      `owner_name = NULL`,
      `phone = 'del_' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 12)`,
      `pin_hash = 'deleted'`,
      `email = NULL`,
      `address = NULL`,
      `city = NULL`,
      `city_id = NULL`,
      `location = NULL`,
      `status = 'disabled'`,
      `free_delivery_threshold = NULL`,
      `delivery_base_charge = NULL`,
      `admin_notes = NULL`,
      `approved_by = NULL`,
      `approved_at = NULL`,
      `last_login_at = NULL`,
      `deleted_at = NOW()`,
      `updated_at = NOW()`,
    ];

    if ((frontImageCol.rowCount ?? 0) > 0) {
      sets.push(`front_image_url = NULL`);
    }

    const result = await client.query(
      `UPDATE restaurants
          SET ${sets.join(', ')}
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [restaurantId]
    );

    if ((result.rowCount ?? 0) === 0) return false;

    if ((restaurantOrderCol.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE orders
            SET delivery_address_snapshot = $2::jsonb
          WHERE restaurant_id = $1`,
        [restaurantId, JSON.stringify(DELETED_RESTAURANT_SNAPSHOT)]
      );
    }

    return true;
  });
}

function publicRestaurant(r: any) {
  return {
    id: r.id,
    business_name: r.business_name,
    owner_name: r.owner_name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    city: r.city,
    city_id: r.city_id,
    status: r.status,
    front_image_url: r.front_image_url ?? null,
    latitude: r.lat ?? null,
    longitude: r.lng ?? null,
  };
}

/**
 * POST /api/restaurant/register
 * A restaurant submits its details + a 4-digit PIN. The account starts as
 * `pending` until an admin approves it.
 */
export const registerRestaurant = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantsTable())) {
    return errorResponse(res, 'Restaurant onboarding is being set up. Please try again shortly.', 503);
  }

  const { business_name, owner_name, email, address, city, city_id: cityIdInput, pin } = req.body;

  let normPhone: string;
  try {
    normPhone = normalizePhoneNumber(String(req.body.phone || ''));
  } catch {
    return errorResponse(res, 'Enter a valid phone number.', 400);
  }

  if (!/^\d{4}$/.test(String(pin || ''))) {
    return errorResponse(res, 'PIN must be exactly 4 digits.', 400);
  }

  // One live account per phone.
  const existing = await query(
    `SELECT id, status FROM restaurants WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
    [normPhone]
  );
  if (existing.rows[0]) {
    const st = existing.rows[0].status;
    return errorResponse(
      res,
      st === 'pending'
        ? 'A request with this number is already under review.'
        : 'This number is already registered as a restaurant.',
      409
    );
  }

  // Resolve to a real service city. A restaurant is city-bound: its request goes
  // to that city's admin, and it only ever sees that city's catalog/orders — so
  // a valid city is REQUIRED. The website/app pre-fill this from the selected
  // city (changed only via the city switcher), so it always resolves.
  let cityId: string | null = null;
  let cityName: string | null = null;
  if (typeof cityIdInput === 'string' && cityIdInput.trim()) {
    const c = await query(
      `SELECT id, name FROM service_cities WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [cityIdInput.trim()]
    );
    if (c.rows[0]) {
      cityId = c.rows[0].id;
      cityName = c.rows[0].name;
    }
  }
  if (!cityId && typeof city === 'string' && city.trim()) {
    const c = await query(
      `SELECT id, name FROM service_cities WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1`,
      [city.trim()]
    );
    if (c.rows[0]) {
      cityId = c.rows[0].id;
      cityName = c.rows[0].name;
    }
  }
  if (!cityId) {
    return errorResponse(res, 'Please select your city (use the city button) before registering.', 400);
  }

  const pinHash = await bcrypt.hash(String(pin), PIN_BCRYPT_ROUNDS);

  let result;
  try {
    result = await query(
      `INSERT INTO restaurants (business_name, owner_name, phone, pin_hash, email, address, city, city_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [
        String(business_name).trim(),
        owner_name ? String(owner_name).trim() : null,
        normPhone,
        pinHash,
        email ? String(email).trim() : null,
        address ? String(address).trim() : null,
        cityName,
        cityId,
      ]
    );
  } catch (err: any) {
    // Unique violation (a live account with this phone already exists) — turn the
    // raw 23505 into a clean message instead of a 500.
    if (err?.code === '23505') {
      return errorResponse(res, 'This number is already registered as a restaurant. Please log in instead.', 409);
    }
    throw err;
  }

  logger.info('Restaurant registration submitted', { restaurantId: result.rows[0].id, phone: normPhone });

  // Notify admins (super + city) of the new restaurant request.
  emitToAdmins('restaurant:application', {
    id: result.rows[0].id,
    businessName: String(business_name).trim(),
    city: cityName,
    cityId,
    createdAt: new Date().toISOString(),
  });

  return createdResponse(
    res,
    { id: result.rows[0].id, status: 'pending' },
    'Your restaurant request has been submitted for review.'
  );
});

/**
 * POST /api/restaurant/login
 * Phone + 4-digit PIN. Only `approved` accounts can log in.
 */
export const loginRestaurant = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantsTable())) {
    return errorResponse(res, 'Restaurant login is being set up. Please try again shortly.', 503);
  }

  const { pin } = req.body;

  let normPhone: string;
  try {
    normPhone = normalizePhoneNumber(String(req.body.phone || ''));
  } catch {
    return errorResponse(res, 'Enter a valid phone number.', 400);
  }
  if (!/^\d{4}$/.test(String(pin || ''))) {
    return errorResponse(res, 'PIN must be exactly 4 digits.', 400);
  }

  const result = await query(
    `SELECT * FROM restaurants WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
    [normPhone]
  );
  const restaurant = result.rows[0];
  if (!restaurant) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  if (restaurant.status === 'pending') {
    return forbiddenResponse(res, 'Your restaurant request is still under review.');
  }
  if (restaurant.status === 'disabled') {
    return forbiddenResponse(res, 'This restaurant account is disabled. Please contact support.');
  }
  if (restaurant.status === 'banned') {
    return forbiddenResponse(res, 'This restaurant account has been banned.');
  }

  const valid = await bcrypt.compare(String(pin), restaurant.pin_hash);
  if (!valid) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  await query(
    `UPDATE restaurants SET last_login_at = NOW(), login_count = login_count + 1, updated_at = NOW() WHERE id = $1`,
    [restaurant.id]
  );

  const token = generateRestaurantToken(restaurant.id, restaurant.phone);
  logger.info('Restaurant login OK', { restaurantId: restaurant.id });

  return successResponse(res, { token, restaurant: publicRestaurant(restaurant) }, 'Login successful');
});

/**
 * GET /api/restaurant/me — current restaurant profile (requires restaurant auth).
 */
export const getRestaurantMe = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT *, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
       FROM restaurants WHERE id = $1 AND deleted_at IS NULL`,
    [req.restaurant!.id]
  );
  if (!result.rows[0]) return unauthorizedResponse(res, 'Restaurant account not found');
  return successResponse(res, publicRestaurant(result.rows[0]), 'Restaurant profile');
});

/**
 * POST /api/restaurant/delete-account
 * Self-service deletion for an approved restaurant session. PII is removed from
 * the account row and restaurant order snapshots are anonymized, while order
 * financial records remain for bookkeeping.
 */
export const deleteRestaurantAccount = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await anonymizeRestaurantAccount(req.restaurant!.id);
  if (!deleted) return unauthorizedResponse(res, 'Restaurant account not found');

  logger.info('Restaurant account deleted (self-service)', { restaurantId: req.restaurant!.id });
  return successResponse(res, null, 'Restaurant account has been deleted');
});

/**
 * POST /api/restaurant/delete-account-by-pin
 * Lets a pending restaurant request be deleted before it can log in. Also works
 * for approved accounts when the owner prefers phone + PIN re-confirmation.
 */
export const deleteRestaurantAccountByPin = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasRestaurantsTable())) {
    return errorResponse(res, 'Restaurant accounts are being set up. Please try again shortly.', 503);
  }

  const { pin } = req.body;
  let normPhone: string;
  try {
    normPhone = normalizePhoneNumber(String(req.body.phone || ''));
  } catch {
    return errorResponse(res, 'Enter a valid phone number.', 400);
  }

  const result = await query(
    `SELECT id, pin_hash FROM restaurants WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
    [normPhone]
  );
  const restaurant = result.rows[0];
  if (!restaurant) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const valid = await bcrypt.compare(String(pin), restaurant.pin_hash);
  if (!valid) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  const deleted = await anonymizeRestaurantAccount(restaurant.id);
  if (!deleted) return unauthorizedResponse(res, 'Restaurant account not found');

  logger.info('Restaurant account deleted by phone/PIN', { restaurantId: restaurant.id });
  return successResponse(res, null, 'Restaurant account/request has been deleted');
});
