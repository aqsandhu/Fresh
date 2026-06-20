// ============================================================================
// RIDER APPLICATION CONTROLLER — "Work as a rider" page.
// Public: page content + application submission. Admin: list/manage + edit
// content. A new application notifies admins in real time.
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from '../utils/response';
import { ensureRiderApplicationsTable } from '../config/riderApplicationSchema';
import { upsertGlobalSiteSetting } from '../utils/siteSettings';
import { resolveCityScope, resolvePublicCityId, cityRowInScope } from '../utils/cityScope';
import { emitToAdmins } from '../config/socket';
import { normalizePhoneNumber } from '../utils/validators';
import logger from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['pending', 'reviewing', 'approved', 'rejected'] as const;

const CONTENT_KEYS = {
  intro: 'rider_page_intro',
  benefits: 'rider_page_benefits',
  hours: 'rider_page_hours',
  terms: 'rider_page_terms',
} as const;

const DEFAULT_CONTENT = {
  intro:
    'FreshBazar کے ساتھ بطور رائڈر کام کریں — اپنی مرضی کے اوقات میں کمائیں اور اپنے شہر میں تازہ سامان پہنچائیں۔',
  benefits:
    'پرکشش فی ڈیلیوری کمائی\nلچکدار اوقاتِ کار\nہفتہ وار ادائیگی\nبونس اور انعامات',
  hours: 'صبح 8 بجے سے رات 10 بجے تک (اپنی سہولت کے مطابق شِفٹ منتخب کریں)',
  terms:
    'درست شناختی کارڈ اور موبائل نمبر لازمی ہے۔\nاپنی موٹر سائیکل/سواری اور اسمارٹ فون درکار ہے۔\nاچھے برتاؤ اور بروقت ڈیلیوری کی توقع کی جاتی ہے۔',
};

interface AppRow {
  id: string;
  full_name: string;
  phone: string;
  city: string | null;
  area: string | null;
  vehicle_type: string | null;
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  city_name?: string | null;
}

function mapApp(r: AppRow) {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    city: r.city,
    cityName: r.city_name ?? r.city ?? null,
    area: r.area,
    vehicleType: r.vehicle_type,
    message: r.message,
    status: r.status,
    adminNotes: r.admin_notes,
    createdAt: r.created_at,
  };
}

function clean(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

// ============================================================================
// PUBLIC
// ============================================================================

/** GET /api/work-as-rider — page content (admin-editable, falls back to defaults). */
export const getWorkAsRiderContent = asyncHandler(async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key IN ($1,$2,$3,$4)`,
    [CONTENT_KEYS.intro, CONTENT_KEYS.benefits, CONTENT_KEYS.hours, CONTENT_KEYS.terms]
  );
  const map: Record<string, string> = {};
  for (const row of result.rows) map[row.key] = row.value;

  return successResponse(
    res,
    {
      intro: map[CONTENT_KEYS.intro] || DEFAULT_CONTENT.intro,
      benefits: map[CONTENT_KEYS.benefits] || DEFAULT_CONTENT.benefits,
      hours: map[CONTENT_KEYS.hours] || DEFAULT_CONTENT.hours,
      terms: map[CONTENT_KEYS.terms] || DEFAULT_CONTENT.terms,
    },
    'Work-as-rider content'
  );
});

/** POST /api/work-as-rider/apply — submit a rider application. */
export const submitRiderApplication = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureRiderApplicationsTable())) {
    return errorResponse(res, 'Applications are not available yet — please try again shortly.', 503);
  }

  const fullName = clean(req.body.fullName ?? req.body.full_name, 255);
  if (fullName.length < 2) return errorResponse(res, 'Please enter your full name.', 400);

  let phone: string;
  try {
    phone = normalizePhoneNumber(String(req.body.phone ?? ''));
  } catch {
    return errorResponse(res, 'Please enter a valid phone number.', 400);
  }

  const area = clean(req.body.area, 255) || null;
  const vehicleType = clean(req.body.vehicleType ?? req.body.vehicle_type, 50) || null;
  const message = clean(req.body.message, 2000) || null;
  const cityName = clean(req.body.city, 120) || null;
  const cityId = await resolvePublicCityId(req).catch(() => null);
  const userId = req.user?.id ?? null;

  const result = await query(
    `INSERT INTO rider_applications (full_name, phone, city, city_id, area, vehicle_type, message, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [fullName, phone, cityName, cityId, area, vehicleType, message, userId]
  );

  logger.info('Rider application submitted', { id: result.rows[0].id, phone });
  emitToAdmins('rider:application', {
    title: 'New rider application',
    message: `${fullName}${cityName ? ` · ${cityName}` : ''}`,
    applicationId: result.rows[0].id,
  });

  return createdResponse(res, mapApp(result.rows[0]), 'Application submitted — our team will contact you.');
});

// ============================================================================
// ADMIN
// ============================================================================

/** GET /api/admin/rider-applications — city-scoped list with optional ?status. */
export const listRiderApplications = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureRiderApplicationsTable())) {
    return successResponse(res, { applications: [], counts: {} }, 'Applications unavailable');
  }
  const scope = await resolveCityScope(req);

  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (!scope.unrestricted && scope.cityId) {
    params.push(scope.cityId);
    where.push(`(ra.city_id = $${params.length} OR ra.city_id IS NULL)`);
  } else if (scope.cityId) {
    params.push(scope.cityId);
    where.push(`(ra.city_id = $${params.length} OR ra.city_id IS NULL)`);
  }

  const status = req.query.status;
  if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where.push(`ra.status = $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  const [rowsRes, countsRes] = await Promise.all([
    query(
      `SELECT ra.*, sc.name AS city_name
         FROM rider_applications ra
         LEFT JOIN service_cities sc ON sc.id = ra.city_id
        WHERE ${whereSql}
        ORDER BY CASE ra.status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, ra.created_at DESC
        LIMIT 500`,
      params
    ),
    query(`SELECT ra.status, COUNT(*)::int AS count FROM rider_applications ra WHERE ${whereSql} GROUP BY ra.status`, params),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countsRes.rows) counts[row.status] = Number(row.count);

  return successResponse(res, { applications: rowsRes.rows.map(mapApp), counts }, 'Rider applications');
});

/** PUT /api/admin/rider-applications/:id — body { status?, adminNotes? } */
export const updateRiderApplication = asyncHandler(async (req: Request, res: Response) => {
  if (!(await ensureRiderApplicationsTable())) return notFoundResponse(res, 'Application not found');
  const { id } = req.params;
  if (!UUID_RE.test(id)) return notFoundResponse(res, 'Application not found');

  // City-scoped: a scoped admin can only act on their own city's applications.
  const existing = await query('SELECT id, city_id FROM rider_applications WHERE id = $1', [id]);
  if (existing.rows.length === 0) return notFoundResponse(res, 'Application not found');
  const appScope = await resolveCityScope(req);
  if (!cityRowInScope(appScope, existing.rows[0].city_id)) return notFoundResponse(res, 'Application not found');

  const sets: string[] = [];
  const params: unknown[] = [];
  if (req.body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(String(req.body.status))) {
      return errorResponse(res, 'Invalid status.', 400);
    }
    params.push(req.body.status);
    sets.push(`status = $${params.length}`);
  }
  if (req.body.adminNotes !== undefined || req.body.admin_notes !== undefined) {
    params.push(clean(req.body.adminNotes ?? req.body.admin_notes, 2000) || null);
    sets.push(`admin_notes = $${params.length}`);
  }
  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);
  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE rider_applications SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return successResponse(res, mapApp(result.rows[0]), 'Application updated');
});

/** PUT /api/admin/work-as-rider — edit page content (intro/benefits/hours/terms). */
export const updateWorkAsRiderContent = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const updates: { key: string; value: string }[] = [];
  if (req.body.intro !== undefined) updates.push({ key: CONTENT_KEYS.intro, value: clean(req.body.intro, 2000) });
  if (req.body.benefits !== undefined) updates.push({ key: CONTENT_KEYS.benefits, value: clean(req.body.benefits, 4000) });
  if (req.body.hours !== undefined) updates.push({ key: CONTENT_KEYS.hours, value: clean(req.body.hours, 2000) });
  if (req.body.terms !== undefined) updates.push({ key: CONTENT_KEYS.terms, value: clean(req.body.terms, 4000) });

  for (const { key, value } of updates) {
    await upsertGlobalSiteSetting(key, value, userId);
  }
  logger.info('Work-as-rider content updated', { by: userId });
  return successResponse(res, { updated: updates.length }, 'Content updated');
});
