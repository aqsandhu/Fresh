// ============================================================================
// OCP CONTROLLER (Order Collection Point operator). Public PIN login + the
// OCP-authed storefront (orders, stock, settlements). Fully isolated from
// user/admin auth via the OCP token (see middleware/ocpAuth.ts).
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from '../utils/response';
import { generateOcpToken } from '../config/jwt';
import { normalizePhoneNumber } from '../utils/validators';
import { hasOcpTables } from '../config/ocpSchema';
import { assignRiderToOrder } from '../utils/assignRiderToOrder';
import logger from '../utils/logger';

function publicOcp(o: any) {
  return {
    id: o.id,
    name: o.name,
    owner_name: o.owner_name,
    phone: o.phone,
    city: o.city_name ?? null,
    city_id: o.city_id,
    address: o.address,
    status: o.status,
  };
}

/** POST /api/ocp/login — phone + 4-digit PIN. Only `active` OCPs can log in. */
export const loginOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) {
    return errorResponse(res, 'OCP login is being set up. Please try again shortly.', 503);
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
    `SELECT o.*, sc.name AS city_name
       FROM order_collection_points o
       LEFT JOIN service_cities sc ON sc.id = o.city_id
      WHERE o.phone = $1 AND o.deleted_at IS NULL LIMIT 1`,
    [normPhone]
  );
  const ocp = result.rows[0];
  if (!ocp) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }
  if (ocp.status !== 'active') {
    return forbiddenResponse(res, 'This OCP account is disabled. Please contact the admin.');
  }

  const valid = await bcrypt.compare(String(pin), ocp.pin_hash);
  if (!valid) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  await query(
    `UPDATE order_collection_points SET last_login_at = NOW(), login_count = login_count + 1, updated_at = NOW() WHERE id = $1`,
    [ocp.id]
  );

  const token = generateOcpToken(ocp.id, ocp.phone);
  logger.info('OCP login', { ocpId: ocp.id });
  return successResponse(res, { token, ocp: publicOcp(ocp) }, 'Logged in');
});

/** GET /api/ocp/me — the signed-in OCP profile. */
export const getOcpMe = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT o.*, sc.name AS city_name
       FROM order_collection_points o
       LEFT JOIN service_cities sc ON sc.id = o.city_id
      WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [req.ocp!.id]
  );
  if (!result.rows[0]) return unauthorizedResponse(res, 'OCP account not found');
  return successResponse(res, publicOcp(result.rows[0]), 'OCP profile');
});

// ── Orders assigned to this OCP ─────────────────────────────────────────────
// SECURITY: the customer phone is omitted server-side unless the admin set
// phone_visible_to_ocp for that order — the OCP can never read it via the API.

/** GET /api/ocp/orders — orders assigned to this OCP (phone redacted by default). */
export const getOcpOrders = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.subtotal, o.delivery_charge, o.total_amount,
            o.paid_amount, o.payment_status, o.created_at, o.placed_at,
            o.phone_visible_to_ocp, o.ocp_payment_settled,
            o.delivery_address_snapshot,
            u.full_name AS customer_name, u.phone AS customer_phone
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
      WHERE o.ocp_id = $1 AND o.deleted_at IS NULL
      ORDER BY o.created_at DESC
      LIMIT 200`,
    [req.ocp!.id]
  );
  const rows = result.rows.map((o: any) => {
    const snap = o.delivery_address_snapshot || {};
    const phoneVisible = o.phone_visible_to_ocp === true;
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      subtotal: parseFloat(o.subtotal),
      delivery_charge: parseFloat(o.delivery_charge),
      total_amount: parseFloat(o.total_amount),
      paid_amount: parseFloat(o.paid_amount || 0),
      payment_status: o.payment_status,
      created_at: o.created_at,
      customer_name: o.customer_name,
      // Phone hidden unless explicitly revealed by an admin.
      customer_phone: phoneVisible ? o.customer_phone : null,
      phone_hidden: !phoneVisible,
      address: snap.written_address || '',
      location: snap.location || null,
    };
  });
  return successResponse(res, rows, 'Orders');
});

/** GET /api/ocp/orders/:id — one order with items (slip). Phone redaction applies. */
export const getOcpOrderDetail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.subtotal, o.delivery_charge, o.total_amount,
            o.discount_amount, o.coupon_discount, o.coupon_code, o.payment_method,
            o.paid_amount, o.payment_status, o.created_at, o.placed_at, o.phone_visible_to_ocp,
            o.is_urgent_delivery, o.urgent_delivery_eta,
            o.delivery_address_snapshot, o.customer_notes,
            u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
            ts.slot_name,
            COALESCE(json_agg(json_build_object(
              'id', oi.id, 'product_name', oi.product_name, 'quantity', oi.quantity,
              'unit', oi.unit, 'quality', oi.quality, 'unit_price', oi.unit_price,
              'total_price', oi.total_price, 'weight_kg', oi.weight_kg, 'final_weight_kg', oi.final_weight_kg
            ) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN time_slots ts ON o.time_slot_id = ts.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1 AND o.ocp_id = $2 AND o.deleted_at IS NULL
      GROUP BY o.id, u.full_name, u.phone, u.email, ts.slot_name`,
    [id, req.ocp!.id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Order not found');
  const o = result.rows[0];
  const snap = o.delivery_address_snapshot || {};
  const phoneVisible = o.phone_visible_to_ocp === true;
  return successResponse(res, {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    subtotal: parseFloat(o.subtotal),
    delivery_charge: parseFloat(o.delivery_charge),
    discount_amount: parseFloat(o.discount_amount || 0),
    coupon_discount: parseFloat(o.coupon_discount || 0),
    coupon_code: o.coupon_code,
    total_amount: parseFloat(o.total_amount),
    paid_amount: parseFloat(o.paid_amount || 0),
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    created_at: o.created_at,
    placed_at: o.placed_at,
    slot_name: o.slot_name,
    is_urgent_delivery: o.is_urgent_delivery === true,
    urgent_delivery_eta: o.urgent_delivery_eta,
    customer_notes: o.customer_notes,
    customer_name: o.customer_name,
    // SECURITY: phone + email are contact info — both gated on the admin's reveal.
    customer_phone: phoneVisible ? o.customer_phone : null,
    customer_email: phoneVisible ? o.customer_email : null,
    phone_hidden: !phoneVisible,
    // Full address snapshot for an admin-identical slip/detail view.
    house_number: snap.house_number || '',
    address: snap.written_address || '',
    landmark: snap.landmark || '',
    area_name: snap.area_name || '',
    city: snap.city || '',
    location: snap.location || null,
    items: o.items || [],
  }, 'Order');
});

/** GET /api/ocp/riders — verified riders in the OCP's city to assign. */
export const getOcpRiders = asyncHandler(async (req: Request, res: Response) => {
  const cityId = req.ocp!.city_id;
  const params: any[] = [];
  let cityClause = '';
  if (cityId) { params.push(cityId); cityClause = ` AND r.city_id = $${params.length}`; }
  const result = await query(
    `SELECT r.id, u.full_name AS name, r.status
       FROM riders r
       JOIN users u ON r.user_id = u.id
      WHERE r.verification_status = 'verified' AND r.deleted_at IS NULL
        AND r.status NOT IN ('offline','on_leave')${cityClause}
      ORDER BY u.full_name ASC`,
    params
  );
  return successResponse(res, result.rows, 'Riders');
});

/** POST /api/ocp/orders/:id/assign-rider — OCP assigns any verified rider. */
export const assignOcpRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rider_id } = req.body;
  if (!rider_id) return errorResponse(res, 'Select a rider.', 400);

  // The order must belong to THIS OCP.
  const own = await query(
    `SELECT 1 FROM orders WHERE id = $1 AND ocp_id = $2 AND deleted_at IS NULL`,
    [id, req.ocp!.id]
  );
  if (own.rows.length === 0) return notFoundResponse(res, 'Order not found');

  try {
    const { order, rider } = await assignRiderToOrder(id, rider_id, undefined);
    return successResponse(res, { order_id: order.id, rider }, 'Rider assigned');
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message || 'Not found');
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }
});

// ── Stock (receive from admin; view balances) ───────────────────────────────

/** GET /api/ocp/stock-requests — incoming + recent stock requests for this OCP. */
export const getOcpStockRequests = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.id, r.status, r.note, r.created_at, r.received_at,
            COALESCE(json_agg(json_build_object(
              'product_id', i.product_id, 'product_name', p.name_en,
              'quality', i.quality, 'quantity', i.quantity
            ) ORDER BY p.name_en) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM ocp_stock_requests r
       LEFT JOIN ocp_stock_request_items i ON i.request_id = r.id
       LEFT JOIN products p ON p.id = i.product_id
      WHERE r.ocp_id = $1
      GROUP BY r.id
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 100`,
    [req.ocp!.id]
  );
  return successResponse(res, result.rows, 'Stock requests');
});

/**
 * POST /api/ocp/stock-requests/:id/receive — OCP manually verifies & receives a
 * stock batch. Transactional + idempotent: adds each item to ocp_stock + ledger,
 * marks the request received. A double-receive is a clean 409 (no double-add).
 */
export const receiveStockRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const ocpId = req.ocp!.id;

  let out: any;
  try {
    out = await withTransaction(async (client) => {
      const reqRow = await client.query(
        `SELECT id, status FROM ocp_stock_requests WHERE id = $1 AND ocp_id = $2 FOR UPDATE`,
        [id, ocpId]
      );
      if (reqRow.rows.length === 0) throw Object.assign(new Error('Stock request not found'), { http: 404 });
      if (reqRow.rows[0].status !== 'pending') {
        throw Object.assign(new Error('This stock request was already processed.'), { http: 409 });
      }
      const items = await client.query(
        `SELECT product_id, quality, quantity FROM ocp_stock_request_items WHERE request_id = $1`,
        [id]
      );
      for (const it of items.rows) {
        const qty = parseFloat(String(it.quantity)) || 0;
        if (qty <= 0) continue;
        await client.query(
          `INSERT INTO ocp_stock (ocp_id, product_id, quality, quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ocp_id, product_id, quality)
           DO UPDATE SET quantity = ocp_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
          [ocpId, it.product_id, it.quality, qty]
        );
        await client.query(
          `INSERT INTO ocp_stock_movements (ocp_id, product_id, quality, delta, reason, ref_request_id)
           VALUES ($1, $2, $3, $4, 'receive', $5)`,
          [ocpId, it.product_id, it.quality, qty, id]
        );
      }
      const upd = await client.query(
        `UPDATE ocp_stock_requests SET status = 'received', received_at = NOW() WHERE id = $1 RETURNING id, status`,
        [id]
      );
      return upd.rows[0];
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 409) return errorResponse(res, err.message, 409);
    throw err;
  }
  logger.info('OCP received stock request', { requestId: id, ocpId });
  return successResponse(res, out, 'Stock received');
});

/** GET /api/ocp/stock — current stock balances for this OCP. */
export const getOcpStock = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT s.product_id, s.quality, s.quantity, p.name_en AS product_name, p.unit_type
       FROM ocp_stock s
       JOIN products p ON p.id = s.product_id
      WHERE s.ocp_id = $1 AND s.quantity > 0
      ORDER BY p.name_en ASC, s.quality ASC`,
    [req.ocp!.id]
  );
  return successResponse(res, result.rows, 'Stock');
});

// ── Payment collection + settlement (OCP → city admin) ──────────────────────

/**
 * POST /api/ocp/orders/:id/collect — record that the OCP collected this order's
 * cash. The amount is ALWAYS the full order total (server-authoritative); the
 * OCP cannot type or alter an amount, so the cash it owes the admin can never be
 * under-recorded. Idempotent: collecting an already-collected order is a no-op.
 */
export const collectOcpPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  let out: any;
  try {
    out = await withTransaction(async (client) => {
      const ord = await client.query(
        `SELECT total_amount, paid_amount, payment_status FROM orders
          WHERE id = $1 AND ocp_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, req.ocp!.id]
      );
      if (ord.rows.length === 0) throw Object.assign(new Error('Order not found'), { http: 404 });
      const total = parseFloat(ord.rows[0].total_amount) || 0;
      const paid = parseFloat(ord.rows[0].paid_amount) || 0;
      // Already fully collected → no-op (idempotent), never double-records.
      if (paid >= total && total > 0) {
        return { paid_amount: paid, payment_status: ord.rows[0].payment_status, already: true };
      }
      // Collection is always the FULL order total — no partial/free-form amount.
      const upd = await client.query(
        `UPDATE orders SET paid_amount = total_amount, payment_status = 'completed'::payment_status, updated_at = NOW()
          WHERE id = $1 RETURNING paid_amount, payment_status`,
        [id]
      );
      return { paid_amount: parseFloat(upd.rows[0].paid_amount), payment_status: upd.rows[0].payment_status };
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    throw err;
  }
  logger.info('OCP collected payment', { orderId: id, ocpId: req.ocp!.id });
  return successResponse(res, out, out?.already ? 'Already collected' : 'Cash collected');
});

/** GET /api/ocp/settlements — due summary + settlement history for this OCP. */
export const getOcpSettlements = asyncHandler(async (req: Request, res: Response) => {
  const ocpId = req.ocp!.id;
  // Due = collected cash NOT yet tied to any settlement.
  const due = await query(
    `SELECT COALESCE(SUM(o.paid_amount), 0) AS amount, COUNT(*) AS orders
       FROM orders o
      WHERE o.ocp_id = $1 AND o.deleted_at IS NULL AND o.paid_amount > 0
        AND NOT EXISTS (SELECT 1 FROM ocp_settlement_orders so WHERE so.order_id = o.id)`,
    [ocpId]
  );
  const list = await query(
    `SELECT id, amount, status, requested_at, received_at FROM ocp_settlements
      WHERE ocp_id = $1 ORDER BY requested_at DESC LIMIT 50`,
    [ocpId]
  );
  return successResponse(
    res,
    {
      due_amount: parseFloat(due.rows[0].amount) || 0,
      due_orders: Number(due.rows[0].orders) || 0,
      settlements: list.rows.map((s: any) => ({ ...s, amount: parseFloat(s.amount) })),
    },
    'Settlements'
  );
});

/** POST /api/ocp/settlements — hand over all currently-due cash to the admin. */
export const sendOcpSettlement = asyncHandler(async (req: Request, res: Response) => {
  const ocpId = req.ocp!.id;
  let out: any;
  try {
    out = await withTransaction(async (client) => {
      // Lock the free collected orders (paid, not already in a settlement).
      const orders = await client.query(
        `SELECT o.id, o.paid_amount
           FROM orders o
          WHERE o.ocp_id = $1 AND o.deleted_at IS NULL AND o.paid_amount > 0
            AND NOT EXISTS (SELECT 1 FROM ocp_settlement_orders so WHERE so.order_id = o.id)
          FOR UPDATE`,
        [ocpId]
      );
      if (orders.rows.length === 0) {
        throw Object.assign(new Error('No collected cash to settle.'), { http: 400 });
      }
      const amount = orders.rows.reduce((s: number, o: any) => s + (parseFloat(o.paid_amount) || 0), 0);
      const set = await client.query(
        `INSERT INTO ocp_settlements (ocp_id, amount, status) VALUES ($1, $2, 'pending') RETURNING id, amount, status, requested_at`,
        [ocpId, amount]
      );
      const settlementId = set.rows[0].id;
      for (const o of orders.rows) {
        await client.query(
          `INSERT INTO ocp_settlement_orders (settlement_id, order_id, amount) VALUES ($1, $2, $3)`,
          [settlementId, o.id, parseFloat(o.paid_amount) || 0]
        );
      }
      return { id: settlementId, amount, orders: orders.rows.length };
    });
  } catch (err: any) {
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }
  logger.info('OCP sent settlement', { settlementId: out.id, ocpId, amount: out.amount });
  return successResponse(res, out, 'Settlement sent — awaiting admin receipt');
});
