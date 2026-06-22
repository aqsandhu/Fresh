// ============================================================================
// FRANCHISE CONTROLLER — public lead capture + admin triage
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
} from '../utils/response';
import logger from '../utils/logger';
import { isMissingTable } from '../utils/dbErrors';

const VALID_STATUSES = ['new', 'contacted', 'closed'];

/**
 * Submit a franchise inquiry (public, rate-limited at the route).
 * POST /api/franchise/inquiries
 */
export const submitFranchiseInquiry = asyncHandler(async (req: Request, res: Response) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const email = String(req.body.email || '').trim();
  const city = String(req.body.city || '').trim();
  const message = String(req.body.message || '').trim();

  if (name.length < 2) return errorResponse(res, 'Please enter your name', 400);
  if (!/^\+?[0-9\-\s]{10,20}$/.test(phone)) {
    return errorResponse(res, 'Please enter a valid phone number', 400);
  }

  const result = await query(
    `INSERT INTO franchise_inquiries (name, phone, email, city, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      name.slice(0, 150),
      phone.slice(0, 30),
      email ? email.slice(0, 150) : null,
      city ? city.slice(0, 120) : null,
      message ? message.slice(0, 2000) : null,
    ]
  );

  logger.info('Franchise inquiry submitted', { id: result.rows[0].id });
  createdResponse(res, { id: result.rows[0].id }, 'Thank you! Our team will contact you soon.');
});

/**
 * List franchise inquiries (admin).
 * GET /api/admin/franchise-inquiries
 */
export const listFranchiseInquiries = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  try {
    const result =
      status && VALID_STATUSES.includes(status)
        ? await query(
            `SELECT id, name, phone, email, city, message, status, created_at
               FROM franchise_inquiries WHERE status = $1 ORDER BY created_at DESC`,
            [status]
          )
        : await query(
            `SELECT id, name, phone, email, city, message, status, created_at
               FROM franchise_inquiries ORDER BY created_at DESC`
          );
    successResponse(res, result.rows, 'Franchise inquiries retrieved');
  } catch (err) {
    if (isMissingTable(err)) return successResponse(res, [], 'Franchise inquiries retrieved');
    throw err;
  }
});

/**
 * Update a franchise inquiry's status (admin).
 * PUT /api/admin/franchise-inquiries/:id
 */
export const updateFranchiseInquiry = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const status = String(req.body.status || '').trim();
  if (!VALID_STATUSES.includes(status)) return errorResponse(res, 'Invalid status', 400);

  const result = await query(
    `UPDATE franchise_inquiries SET status = $1 WHERE id = $2 RETURNING id`,
    [status, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Inquiry not found');
  successResponse(res, { id, status }, 'Inquiry updated');
});
