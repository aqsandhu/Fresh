// Call requests, location, duty status, door pin and photo — moved from rider.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../utils/caughtError';
import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../utils/response';
import { hasRestaurantDeliveryColumns } from '../../config/restaurantSchema';
import { emitRiderEventToAdmins, emitRiderLocationUpdate } from '../../config/socket';
import { resolveDutyStatus } from '../../utils/riderAvailability';
import logger from '../../utils/logger';
import { resolveRiderId, resolveTaskAddress, notifyArrival } from './shared';

/**
 * Request to call customer (privacy protected)
 * POST /api/rider/call-request   Body: { order_id }
 *
 * Phone visible (admin override) → returns the number to dial.
 * Phone hidden → the customer is notified that the rider is at the door
 * (same as POST /tasks/:id/arrived) and `notified: true` is returned.
 */
export const requestCall = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { order_id } = req.body;
  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const orderResult = await query(
    `SELECT o.id, o.rider_id, o.show_customer_phone,
            COALESCE(u.phone, o.delivery_address_snapshot->>'phone') AS customer_phone,
            (SELECT rt.id FROM rider_tasks rt
              WHERE rt.order_id = o.id AND rt.rider_id = $2 AND rt.status IN ('assigned', 'in_progress')
              ORDER BY rt.assigned_at DESC LIMIT 1) AS task_id
     FROM orders o
     LEFT JOIN users u ON o.user_id = u.id
     WHERE o.id = $1 AND o.rider_id = $2 AND o.deleted_at IS NULL`,
    [order_id, riderId]
  );

  if (orderResult.rows.length === 0) {
    return notFoundResponse(res, 'Order not found or not assigned to you');
  }

  const order = orderResult.rows[0];

  if (order.show_customer_phone && order.customer_phone) {
    const callResult = await query(
      `INSERT INTO call_requests (rider_id, order_id, virtual_number, status)
       VALUES ($1, $2, $3, 'requested')
       RETURNING id`,
      [riderId, order_id, order.customer_phone]
    );
    return successResponse(res, {
      call_request_id: callResult.rows[0].id,
      virtual_number: order.customer_phone,
      notified: false,
      message: 'Dial the number to connect with the customer.',
    }, 'Call request created successfully');
  }

  if (!order.task_id) {
    return errorResponse(res, 'This delivery is no longer active.', 409);
  }

  try {
    const out = await notifyArrival(riderId, order.task_id);
    return successResponse(res, {
      call_request_id: null,
      virtual_number: null,
      notified: out.notified,
      reason: out.reason ?? null,
      message: out.notified
        ? 'The customer has been notified that you are at the door.'
        : 'Customer phone is hidden — ask the admin to call them.',
    }, out.notified ? 'Customer notified' : 'Arrival recorded');
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
});

// ── Location / duty ─────────────────────────────────────────────────────────

/**
 * Update rider location
 * PUT /api/rider/location
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { latitude, longitude, accuracy } = req.body;

  const result = await query(
    `UPDATE riders
     SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_accuracy = $4,
         location_updated_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $3 AND deleted_at IS NULL
     RETURNING id, location_updated_at`,
    [longitude, latitude, req.user.id, accuracy ?? null]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found');
  }

  await emitRiderLocationUpdate({
    riderId: result.rows[0].id,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    updatedAt: result.rows[0].location_updated_at?.toISOString?.() || new Date().toISOString(),
  });

  successResponse(res, null, 'Location updated successfully');
});

/**
 * Duty toggle
 * PUT /api/rider/status   Body: { status: 'available' | 'offline' }
 *
 * 'available' with tasks still in hand is stored as 'busy' so dispatch sees
 * the real load; 'busy' itself is derived, never chosen by the rider.
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { status } = req.body;
  if (!['available', 'offline', 'on_leave'].includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const active = await query(
    `SELECT COUNT(*)::int AS n FROM rider_tasks WHERE rider_id = $1 AND status IN ('assigned', 'in_progress')`,
    [riderId]
  );
  const activeTasks = Number(active.rows[0]?.n || 0);
  const finalStatus = resolveDutyStatus(status, activeTasks > 0);

  const result = await query(
    `UPDATE riders SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, status, location_updated_at`,
    [finalStatus, riderId]
  );

  emitRiderEventToAdmins(riderId, 'rider:status', { riderId, status: finalStatus, activeTasks });
  successResponse(res, { ...result.rows[0], active_tasks: activeTasks }, 'Status updated successfully');
});

// ── Address pin / door picture ──────────────────────────────────────────────

/**
 * Pin location for a task's delivery address (persists for future orders)
 * PUT /api/rider/tasks/:id/pin-location
 */
export const pinLocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const { latitude, longitude } = req.body;

  if (latitude == null || longitude == null) {
    return errorResponse(res, 'Latitude and longitude are required', 400);
  }

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const target = await resolveTaskAddress(id, riderId);
  if (!target) return notFoundResponse(res, 'Task not found');

  // Restaurant order: update the restaurant's MASTER location (shows everywhere)
  // + patch this order's snapshot. No addresses row exists for these.
  if (target.restaurant_id) {
    await query(
      `UPDATE restaurants
          SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, updated_at = NOW()
        WHERE id = $3`,
      [longitude, latitude, target.restaurant_id]
    );
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{location}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify({ latitude, longitude }), target.order_id]
    );
    logger.info('Rider pinned restaurant location', { riderId, taskId: id, restaurantId: target.restaurant_id });
    return successResponse(res, { latitude, longitude }, 'Location pinned successfully');
  }

  if (!target.address_id) {
    return errorResponse(res, 'This task has no saved address to pin', 400);
  }

  await query(
    `UPDATE addresses
     SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         location_added_by = 'rider',
         updated_at = NOW()
     WHERE id = $3`,
    [longitude, latitude, target.address_id]
  );

  // Keep this order's snapshot in step so admin/customer maps agree.
  if (target.order_id) {
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{location}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify({ latitude, longitude }), target.order_id]
    );
  }

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
    await query('UPDATE addresses SET zone_id = $1 WHERE id = $2', [zoneResult.rows[0].id, target.address_id]);
  }

  logger.info('Rider pinned location for address', { riderId, taskId: id, addressId: target.address_id });
  successResponse(res, { latitude, longitude }, 'Location pinned successfully');
});

/**
 * Upload / update door picture for the delivery address
 * POST /api/rider/tasks/:id/door-picture
 */
export const uploadDoorPicture = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  if (!req.file) {
    return errorResponse(res, 'Door picture image is required', 400);
  }

  const riderId = await resolveRiderId(req.user.id);
  if (!riderId) return notFoundResponse(res, 'Rider not found');

  const target = await resolveTaskAddress(id, riderId);
  if (!target) return notFoundResponse(res, 'Task not found');

  const imageUrl = req.file.url || '';
  if (!imageUrl) {
    return errorResponse(res, 'Image upload failed (storage misconfigured)', 500);
  }

  // Restaurant order: the "door picture" is the restaurant's storefront photo.
  if (target.restaurant_id) {
    if (await hasRestaurantDeliveryColumns()) {
      await query(`UPDATE restaurants SET front_image_url = $1, updated_at = NOW() WHERE id = $2`, [imageUrl, target.restaurant_id]);
    }
    await query(
      `UPDATE orders
          SET delivery_address_snapshot = jsonb_set(
                COALESCE(delivery_address_snapshot, '{}'::jsonb), '{front_image_url}', $1::jsonb, true)
        WHERE id = $2`,
      [JSON.stringify(imageUrl), target.order_id]
    );
    logger.info('Rider updated restaurant front image', { riderId, taskId: id, restaurantId: target.restaurant_id });
    return successResponse(res, { url: imageUrl }, 'Front image uploaded successfully');
  }

  if (!target.address_id) {
    return errorResponse(res, 'This task has no saved address', 400);
  }

  await query(
    `UPDATE addresses SET door_picture_url = $1, updated_at = NOW() WHERE id = $2`,
    [imageUrl, target.address_id]
  );

  logger.info('Rider uploaded door picture', { riderId, taskId: id, addressId: target.address_id });
  successResponse(res, { url: imageUrl }, 'Door picture uploaded successfully');
});

// ── Earnings / stats ────────────────────────────────────────────────────────
