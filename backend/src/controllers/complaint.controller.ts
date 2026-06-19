// ============================================================================
// COMPLAINT CONTROLLER — customer complaint tickets + admin resolution.
// Customers file complaints (optionally tied to an order); admins triage them
// city-scoped, respond, and move them through an open → resolved workflow.
// ============================================================================

import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from '../utils/response';
import { ensureFeedbackTables, hasComplaintImagesColumn } from '../config/feedbackSchema';
import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { resolveCityScope, resolvePublicCityId } from '../utils/cityScope';
import { emitToAdmins } from '../config/socket';
import logger from '../utils/logger';

const CATEGORIES = [
  'delivery',
  'product_quality',
  'rider_behavior',
  'payment',
  'app_issue',
  'other',
] as const;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function cleanText(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

interface ComplaintRow {
  id: string;
  ticket_number: string;
  user_id: string;
  order_id: string | null;
  rider_id: string | null;
  city_id: string | null;
  category: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  images?: string[] | null;
  order_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  city_name?: string | null;
}

function mapComplaint(r: ComplaintRow) {
  return {
    id: r.id,
    ticketNumber: r.ticket_number,
    orderId: r.order_id,
    orderNumber: r.order_number ?? null,
    riderId: r.rider_id,
    category: r.category,
    subject: r.subject,
    message: r.message,
    status: r.status,
    priority: r.priority,
    images: Array.isArray(r.images) ? r.images : [],
    adminResponse: r.admin_response,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    customerName: r.customer_name ?? null,
    customerPhone: r.customer_phone ?? null,
    cityName: r.city_name ?? null,
  };
}

async function generateTicketNumber(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = 'CMP-' + randomBytes(4).toString('hex').toUpperCase();
    const existing = await query('SELECT 1 FROM complaints WHERE ticket_number = $1 LIMIT 1', [
      candidate,
    ]);
    if (existing.rows.length === 0) return candidate;
  }
  // Extremely unlikely fallback — include a timestamp for uniqueness.
  return 'CMP-' + Date.now().toString(36).toUpperCase();
}

// ============================================================================
// CUSTOMER-FACING
// ============================================================================

/**
 * POST /api/complaints
 * Body: { subject, message, category?, orderId? }
 * Files a complaint. When tied to an order it inherits that order's city + rider.
 */
export const fileComplaint = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!(await ensureFeedbackTables())) {
    return errorResponse(res, 'Complaints are not available yet — please try again shortly.', 503);
  }

  const subject = cleanText(req.body.subject, 200);
  const message = cleanText(req.body.message, 4000);
  if (subject.length < 3) return errorResponse(res, 'Please add a short subject (min 3 characters).', 400);
  if (message.length < 5) return errorResponse(res, 'Please describe your complaint (min 5 characters).', 400);

  const rawCategory = String(req.body.category ?? 'other').trim();
  const category = (CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : 'other';

  const orderId = req.body.orderId ?? req.body.order_id;
  let resolvedOrderId: string | null = null;
  let cityId: string | null = null;
  let riderId: string | null = null;

  if (orderId) {
    if (!isUuid(String(orderId))) return errorResponse(res, 'Invalid order reference.', 400);
    const orderRes = await query(
      `SELECT id, user_id, city_id, COALESCE(rider_id, delivered_by) AS rider_id
         FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [String(orderId)]
    );
    const order = orderRes.rows[0];
    if (!order) return notFoundResponse(res, 'Order not found');
    if (order.user_id !== req.user.id) {
      return errorResponse(res, 'You can only file a complaint about your own order.', 403);
    }
    resolvedOrderId = order.id;
    cityId = order.city_id;
    riderId = order.rider_id;
  } else {
    // General complaint — best-effort city from the query/header for routing.
    cityId = await resolvePublicCityId(req).catch(() => null);
  }

  // Optional attachments uploaded via multipart (the upload middleware has
  // already pushed each file to storage and set f.url). Capped + gated.
  const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  const imageUrls = uploadedFiles
    .map((f) => (f as Express.Multer.File & { url?: string }).url || '')
    .filter(Boolean)
    .slice(0, 5);
  const imagesReady = imageUrls.length > 0 && (await hasComplaintImagesColumn());

  const ticketNumber = await generateTicketNumber();

  const result = imagesReady
    ? await query(
        `INSERT INTO complaints
           (ticket_number, user_id, order_id, rider_id, city_id, category, subject, message, images)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [ticketNumber, req.user.id, resolvedOrderId, riderId, cityId, category, subject, message, imageUrls]
      )
    : await query(
        `INSERT INTO complaints
           (ticket_number, user_id, order_id, rider_id, city_id, category, subject, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [ticketNumber, req.user.id, resolvedOrderId, riderId, cityId, category, subject, message]
      );

  logger.info('Complaint filed', { ticket: ticketNumber, userId: req.user.id, category, images: imageUrls.length });

  // Real-time notify admins (the panel shows a toast + bell entry).
  emitToAdmins('complaint:new', {
    title: 'New complaint',
    message: `#${ticketNumber}: ${subject}`,
    ticketNumber,
    complaintId: result.rows[0].id,
    category,
  });

  return createdResponse(res, mapComplaint(result.rows[0]), 'Your complaint has been submitted');
});

/** GET /api/complaints/mine — the customer's own complaints (newest first). */
export const getMyComplaints = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return errorResponse(res, 'Authentication required', 401);
  if (!(await ensureFeedbackTables())) return successResponse(res, [], 'No complaints');

  const result = await query(
    `SELECT c.*, o.order_number
       FROM complaints c
       LEFT JOIN orders o ON o.id = c.order_id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  return successResponse(res, result.rows.map(mapComplaint), 'My complaints');
});

// ============================================================================
// ADMIN-FACING
// ============================================================================

/** GET /api/admin/complaints — city-scoped list with optional ?status filter. */
export const listComplaints = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFeedbackTables())) {
    return successResponse(res, { complaints: [], counts: {} }, 'Complaints unavailable');
  }
  const scope = await resolveCityScope(req);

  const where: string[] = ['1=1'];
  const params: unknown[] = [];

  if (!scope.unrestricted && scope.cityId) {
    params.push(scope.cityId);
    where.push(`(c.city_id = $${params.length} OR c.city_id IS NULL)`);
  } else if (scope.cityId) {
    params.push(scope.cityId);
    where.push(`(c.city_id = $${params.length} OR c.city_id IS NULL)`);
  }

  const status = req.query.status;
  if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  const [rowsRes, countsRes] = await Promise.all([
    query(
      `SELECT c.*, o.order_number, sc.name AS city_name,
              u.full_name AS customer_name, u.phone AS customer_phone
         FROM complaints c
         LEFT JOIN orders o ON o.id = c.order_id
         LEFT JOIN service_cities sc ON sc.id = c.city_id
         LEFT JOIN users u ON u.id = c.user_id
        WHERE ${whereSql}
        ORDER BY
          CASE c.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
          c.created_at DESC
        LIMIT 500`,
      params
    ),
    query(
      `SELECT c.status, COUNT(*)::int AS count
         FROM complaints c
        WHERE ${whereSql}
        GROUP BY c.status`,
      params
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countsRes.rows) counts[row.status] = Number(row.count);

  return successResponse(
    res,
    { complaints: rowsRes.rows.map(mapComplaint), counts },
    'Complaints retrieved'
  );
});

/** GET /api/admin/complaints/:id — single complaint (city-scoped). */
export const getComplaint = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFeedbackTables())) return notFoundResponse(res, 'Complaint not found');
  const scope = await resolveCityScope(req);
  const { id } = req.params;
  if (!isUuid(id)) return notFoundResponse(res, 'Complaint not found');

  const result = await query(
    `SELECT c.*, o.order_number, sc.name AS city_name,
            u.full_name AS customer_name, u.phone AS customer_phone
       FROM complaints c
       LEFT JOIN orders o ON o.id = c.order_id
       LEFT JOIN service_cities sc ON sc.id = c.city_id
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return notFoundResponse(res, 'Complaint not found');
  if (!scope.unrestricted && scope.cityId && row.city_id && row.city_id !== scope.cityId) {
    return errorResponse(res, 'This complaint belongs to another city.', 403);
  }

  // Refund context (migration 37): how much the order paid, how much has already
  // been refunded, and the refund history — so the admin can refund up to paid.
  let refundInfo: any = null;
  if (row.order_id && (await hasCatalogV2Columns())) {
    const ord = await query(`SELECT total_amount, paid_amount FROM orders WHERE id = $1`, [row.order_id]);
    const refs = await query(
      `SELECT id, amount, original_payment_source, note, created_at FROM refunds WHERE order_id = $1 ORDER BY created_at DESC`,
      [row.order_id]
    );
    const paid = parseFloat(ord.rows[0]?.paid_amount || 0) || 0;
    const refunded = refs.rows.reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);
    refundInfo = {
      totalAmount: parseFloat(ord.rows[0]?.total_amount || 0) || 0,
      paidAmount: paid,
      refundedTotal: refunded,
      refundable: Math.max(0, paid - refunded),
      refunds: refs.rows.map((r: any) => ({
        id: r.id, amount: parseFloat(r.amount), source: r.original_payment_source, note: r.note, createdAt: r.created_at,
      })),
    };
  }

  return successResponse(res, { ...mapComplaint(row), order: refundInfo }, 'Complaint retrieved');
});

/**
 * POST /api/admin/complaints/:id/refund — admin-only refund against the
 * complained order. Always recorded against the ADMIN account (OCP balances are
 * never touched); the original payment source is stored for the record only.
 * No stock is returned. Guarded so Σ refunds can never exceed what was paid.
 */
export const refundComplaint = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasCatalogV2Columns())) return errorResponse(res, 'Refunds are being set up. Try again shortly.', 503);
  const scope = await resolveCityScope(req);
  const { id } = req.params;
  if (!isUuid(id)) return notFoundResponse(res, 'Complaint not found');

  const amount = parseFloat(String(req.body?.amount));
  if (!Number.isFinite(amount) || amount <= 0) return errorResponse(res, 'Enter a valid refund amount.', 400);
  const source = req.body?.source === 'ocp' ? 'ocp' : 'admin';

  const cRes = await query(`SELECT id, order_id, city_id FROM complaints WHERE id = $1`, [id]);
  const complaint = cRes.rows[0];
  if (!complaint) return notFoundResponse(res, 'Complaint not found');
  if (!scope.unrestricted && scope.cityId && complaint.city_id && complaint.city_id !== scope.cityId) {
    return errorResponse(res, 'This complaint belongs to another city.', 403);
  }
  if (!complaint.order_id) return errorResponse(res, 'This complaint is not linked to an order.', 400);

  let out: any;
  try {
    out = await withTransaction(async (client) => {
      const ord = await client.query(`SELECT paid_amount FROM orders WHERE id = $1 FOR UPDATE`, [complaint.order_id]);
      if (ord.rows.length === 0) throw Object.assign(new Error('Order not found'), { http: 404 });
      const paid = parseFloat(ord.rows[0].paid_amount) || 0;
      const already = await client.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE order_id = $1`, [complaint.order_id]);
      const refunded = parseFloat(already.rows[0].total) || 0;
      if (amount > paid - refunded + 1e-6) {
        throw Object.assign(new Error(`Refund exceeds the refundable amount (Rs. ${Math.max(0, paid - refunded)}).`), { http: 400 });
      }
      const ins = await client.query(
        `INSERT INTO refunds (order_id, complaint_id, amount, original_payment_source, note, refunded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, amount, original_payment_source, created_at`,
        [complaint.order_id, id, amount, source, req.body?.note || null, req.user?.id ?? null]
      );
      return ins.rows[0];
    });
  } catch (err: any) {
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  logger.info('Complaint refund recorded', { complaintId: id, orderId: complaint.order_id, amount, source, by: req.user?.id });
  return successResponse(res, { id: out.id, amount: parseFloat(out.amount), source: out.original_payment_source }, 'Refund recorded');
});

/**
 * PUT /api/admin/complaints/:id
 * Body: { status?, adminResponse?, priority? } — respond to / progress a ticket.
 */
export const updateComplaint = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureFeedbackTables())) return notFoundResponse(res, 'Complaint not found');
  const scope = await resolveCityScope(req);
  const { id } = req.params;
  if (!isUuid(id)) return notFoundResponse(res, 'Complaint not found');

  const existing = await query('SELECT id, city_id, status FROM complaints WHERE id = $1', [id]);
  const row = existing.rows[0];
  if (!row) return notFoundResponse(res, 'Complaint not found');
  if (!scope.unrestricted && scope.cityId && row.city_id && row.city_id !== scope.cityId) {
    return errorResponse(res, 'This complaint belongs to another city.', 403);
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  const status = req.body.status;
  if (status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(String(status))) {
      return errorResponse(res, 'Invalid status.', 400);
    }
    params.push(status);
    sets.push(`status = $${params.length}`);
    // Stamp resolution metadata when moving to a closed state.
    if (status === 'resolved' || status === 'closed') {
      params.push(req.user?.id ?? null);
      sets.push(`resolved_by = $${params.length}`);
      sets.push(`resolved_at = NOW()`);
    } else {
      sets.push(`resolved_at = NULL`);
      sets.push(`resolved_by = NULL`);
    }
  }

  const priority = req.body.priority;
  if (priority !== undefined) {
    if (!(PRIORITIES as readonly string[]).includes(String(priority))) {
      return errorResponse(res, 'Invalid priority.', 400);
    }
    params.push(priority);
    sets.push(`priority = $${params.length}`);
  }

  const adminResponse = req.body.adminResponse ?? req.body.admin_response;
  if (adminResponse !== undefined) {
    params.push(cleanText(adminResponse, 4000) || null);
    sets.push(`admin_response = $${params.length}`);
  }

  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE complaints SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  logger.info('Complaint updated', { complaintId: id, by: req.user?.id });
  return successResponse(res, mapComplaint(result.rows[0]), 'Complaint updated');
});
