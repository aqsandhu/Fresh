// ============================================================================
// ADDRESS CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../utils/response';
import { getFileUrl } from '../middleware/upload';
import logger from '../utils/logger';

/**
 * Get all addresses for user
 * GET /api/addresses
 */
export const getAddresses = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const result = await query(
    `SELECT 
      a.id, a.address_type, a.house_number, a.written_address, a.landmark,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      a.location_accuracy, a.google_place_id, a.door_picture_url,
      a.area_name, a.city, a.province, a.postal_code,
      a.is_default, a.is_verified, a.delivery_instructions,
      dz.name as zone_name, dz.code as zone_code,
      a.created_at, a.updated_at
    FROM addresses a
    LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
    WHERE a.user_id = $1 AND a.deleted_at IS NULL
    ORDER BY a.is_default DESC, a.created_at DESC`,
    [req.user.id]
  );

  successResponse(res, result.rows, 'Addresses retrieved successfully');
});

/**
 * Get address by ID
 * GET /api/addresses/:id
 */
export const getAddressById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  const result = await query(
    `SELECT 
      a.id, a.address_type, a.house_number, a.written_address, a.landmark,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      a.location_accuracy, a.google_place_id, a.door_picture_url,
      a.area_name, a.city, a.province, a.postal_code,
      a.is_default, a.is_verified, a.delivery_instructions,
      dz.name as zone_name, dz.code as zone_code,
      a.created_at, a.updated_at
    FROM addresses a
    LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
    WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL`,
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  successResponse(res, result.rows[0], 'Address retrieved successfully');
});

/**
 * Create new address
 * POST /api/addresses
 */
export const createAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const {
    address_type = 'home',
    written_address,
    landmark,
    latitude,
    longitude,
    area_name,
    city = 'Gujrat',
    province = 'Punjab',
    postal_code,
    is_default = false,
    delivery_instructions,
  } = req.body;

  // Get door picture from uploaded file
  const door_picture_url = req.file ? getFileUrl(req.file.filename) : null;

  let zone_id = null;
  const hasLocation = latitude != null && longitude != null;

  if (hasLocation) {
    // Find delivery zone based on location
    const zoneResult = await query(
      `SELECT id FROM delivery_zones 
       WHERE is_active = TRUE 
       AND (boundary IS NULL OR ST_Within(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography::geometry,
         boundary::geometry
       ))
       LIMIT 1`,
      [longitude, latitude]
    );
    zone_id = zoneResult.rows.length > 0 ? zoneResult.rows[0].id : null;
  }

  // Create address
  let result;
  if (hasLocation) {
    result = await query(
      `INSERT INTO addresses (
        user_id, address_type, written_address, landmark,
        location, area_name, city, province, postal_code,
        zone_id, door_picture_url, is_default, delivery_instructions,
        location_added_by
      ) VALUES (
        $1, $2, $3, $4,
        ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        'user'
      ) RETURNING *`,
      [
        req.user.id, address_type, written_address, landmark,
        longitude, latitude, area_name, city, province, postal_code,
        zone_id, door_picture_url, is_default, delivery_instructions,
      ]
    );
  } else {
    result = await query(
      `INSERT INTO addresses (
        user_id, address_type, written_address, landmark,
        location, area_name, city, province, postal_code,
        zone_id, door_picture_url, is_default, delivery_instructions
      ) VALUES (
        $1, $2, $3, $4,
        NULL,
        $5, $6, $7, $8,
        $9, $10, $11, $12
      ) RETURNING *`,
      [
        req.user.id, address_type, written_address, landmark,
        area_name, city, province, postal_code,
        zone_id, door_picture_url, is_default, delivery_instructions,
      ]
    );
  }

  logger.info('Address created', { userId: req.user.id, addressId: result.rows[0].id });

  successResponse(res, result.rows[0], 'Address created successfully', 201);
});

/**
 * Update address
 * PUT /api/addresses/:id
 */
export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const {
    address_type,
    written_address,
    landmark,
    latitude,
    longitude,
    area_name,
    city,
    province,
    postal_code,
    is_default,
    delivery_instructions,
  } = req.body;

  // Check if address exists and belongs to user
  const existingResult = await query(
    'SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [id, req.user.id]
  );

  if (existingResult.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  // Build update query
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (address_type !== undefined) {
    updates.push(`address_type = $${paramIndex++}`);
    values.push(address_type);
  }

  if (written_address !== undefined) {
    updates.push(`written_address = $${paramIndex++}`);
    values.push(written_address);
  }

  if (landmark !== undefined) {
    updates.push(`landmark = $${paramIndex++}`);
    values.push(landmark);
  }

  if (area_name !== undefined) {
    updates.push(`area_name = $${paramIndex++}`);
    values.push(area_name);
  }

  if (city !== undefined) {
    updates.push(`city = $${paramIndex++}`);
    values.push(city);
  }

  if (province !== undefined) {
    updates.push(`province = $${paramIndex++}`);
    values.push(province);
  }

  if (postal_code !== undefined) {
    updates.push(`postal_code = $${paramIndex++}`);
    values.push(postal_code);
  }

  if (is_default !== undefined) {
    updates.push(`is_default = $${paramIndex++}`);
    values.push(is_default);
  }

  if (delivery_instructions !== undefined) {
    updates.push(`delivery_instructions = $${paramIndex++}`);
    values.push(delivery_instructions);
  }

  // Update door picture if new file uploaded
  if (req.file) {
    updates.push(`door_picture_url = $${paramIndex++}`);
    values.push(getFileUrl(req.file.filename));
  }

  // Update location if lat/lng provided
  if (latitude != null && longitude != null) {
    updates.push(`location = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`);
    values.push(longitude, latitude);
    paramIndex += 2;
    updates.push(`location_added_by = $${paramIndex++}`);
    values.push('user');

    // Also update delivery zone
    const zoneResult = await query(
      `SELECT id FROM delivery_zones 
       WHERE is_active = TRUE 
       AND (boundary IS NULL OR ST_Within(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography::geometry,
         boundary::geometry
       ))
       LIMIT 1`,
      [longitude, latitude]
    );
    if (zoneResult.rows.length > 0) {
      updates.push(`zone_id = $${paramIndex++}`);
      values.push(zoneResult.rows[0].id);
    }
  }

  if (updates.length === 0) {
    return errorResponse(res, 'No fields to update', 400);
  }

  values.push(id);

  const result = await query(
    `UPDATE addresses SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  successResponse(res, result.rows[0], 'Address updated successfully');
});

/**
 * Delete address (soft delete)
 * DELETE /api/addresses/:id
 */
export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  // Check if address exists and belongs to user
  const existingResult = await query(
    'SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [id, req.user.id]
  );

  if (existingResult.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  // Soft delete
  await query(
    'UPDATE addresses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
    [id]
  );

  successResponse(res, null, 'Address deleted successfully');
});

/**
 * Set default address
 * PUT /api/addresses/:id/set-default
 */
export const setDefaultAddress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  // Check if address exists and belongs to user
  const existingResult = await query(
    'SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [id, req.user.id]
  );

  if (existingResult.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  // Set as default (trigger will unset other defaults)
  await query(
    'UPDATE addresses SET is_default = TRUE, updated_at = NOW() WHERE id = $1',
    [id]
  );

  successResponse(res, null, 'Default address set successfully');
});
