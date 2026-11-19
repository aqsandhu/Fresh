// ============================================================================
// AUDIT LOGGING MIDDLEWARE
// ============================================================================
// Logs all admin actions for compliance, security forensics, and accountability.
// Applied to all POST, PUT, PATCH, DELETE endpoints on admin routes.
//
// Logged fields:
//   - action:        The HTTP method + route pattern (e.g., "PUT /admin/orders/:id/status")
//   - adminId:       UUID of the admin performing the action
//   - adminEmail:    Email of the admin for human readability
//   - resource:      The resource being modified (e.g., "orders", "products")
//   - resourceId:    The specific resource ID (if applicable)
//   - oldData:       Previous state of the resource (if available)
//   - newData:       New state / request payload
//   - ip:            Client IP address
//   - userAgent:     Browser/client user agent
//   - timestamp:     ISO timestamp
//   - status:        'success' | 'failed'
//
// REQUIRED SQL:
/*
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(255) NOT NULL,
  admin_id UUID REFERENCES users(id),
  admin_email VARCHAR(255),
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT audit_logs_action_check CHECK (action <> '')
);

-- Indexes for fast filtering
CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
*/
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import logger from '../utils/logger';

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  action: string;
  // NULL (not 'anonymous') when unauthenticated — admin_id is a UUID column
  // and the sentinel string used to fail the INSERT with 22P02.
  adminId: string | null;
  adminEmail?: string;
  resource: string;
  resourceId?: string;
  oldData?: unknown;
  newData?: unknown;
  // NULL (not 'system'/'unknown') when no IP is available — ip_address is INET.
  ip: string | null;
  userAgent?: string;
  timestamp: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * Extract resource name and ID from request path
 * e.g., "/api/admin/orders/123/status" -> { resource: "orders", resourceId: "123" }
 */
const extractResourceInfo = (req: Request): { resource: string; resourceId?: string } => {
  // This middleware is mounted with router.use(), so it runs BEFORE the route
  // is matched: req.route and req.params are still empty and req.path is
  // relative to the router ("/products/<uuid>", "/expenses"). The old code
  // read "the segment after admin" and the route params, so every row was
  // stored with resource = "unknown" (or the record's own id), no
  // resource_id and — because the table lookup keys on the resource — never
  // an old value. Parse the path itself instead.
  const path: string = String(req.path || req.route?.path || '');
  const segments: string[] = path.split('/').filter(Boolean);
  const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s) || /^\d+$/.test(s);

  const adminIndex = segments.indexOf('admin');
  const named = (adminIndex === -1 ? segments : segments.slice(adminIndex + 1))
    .filter((s) => s !== 'api' && !s.startsWith(':'));
  const resource = named.find((s) => !isId(s)) || 'unknown';

  const paramValues = Object.values(req.params || {}) as unknown[];
  const resourceId =
    (paramValues.find((v) => typeof v === 'string' && isId(v)) as string | undefined) ||
    segments.find(isId);

  return { resource, resourceId };
};

/**
 * Build a human-readable action string from request
 */
const buildActionName = (req: Request): string => {
  const method = req.method;
  const path = req.route?.path || req.path || 'unknown';
  return `${method} ${path}`;
};

/**
 * Sanitize sensitive data before logging
 * Removes passwords, tokens, secrets, etc.
 */
const sanitizeData = (data: unknown): unknown => {
  if (!data || typeof data !== 'object') return data;

  const sensitiveKeys = [
    'password', 'password_hash', 'token', 'secret', 'api_key',
    'authorization', 'cookie', 'credit_card', 'cnic', 'bank_account',
    'otp',
  ];
  // Exact-match keys: "pin" as a substring would also redact e.g.
  // "shipping_address", so PIN-shaped keys are matched whole.
  const exactSensitiveKeys = new Set([
    'pin', 'new_pin', 'old_pin', 'current_pin', 'confirm_pin', 'pin_hash', 'pin_code',
  ]);

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (exactSensitiveKeys.has(lowerKey) || sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Write audit log entry to database
 */
const writeAuditLog = async (entry: AuditLogEntry): Promise<void> => {
  try {
    await query(
      `INSERT INTO audit_logs
         (action, admin_id, admin_email, resource, resource_id,
          old_data, new_data, ip_address, user_agent, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.action,
        entry.adminId,
        entry.adminEmail || null,
        entry.resource,
        entry.resourceId || null,
        entry.oldData ? JSON.stringify(sanitizeData(entry.oldData)) : null,
        entry.newData ? JSON.stringify(sanitizeData(entry.newData)) : null,
        entry.ip || null,
        entry.userAgent || null,
        entry.status,
        entry.errorMessage || null,
      ]
    );
  } catch (dbError) {
    // Audit logging failure must NOT break the main request
    logger.error('Failed to write audit log (non-fatal)', {
      error: dbError,
      action: entry.action,
      adminId: entry.adminId,
    });
  }
};

/**
 * Middleware factory that creates an audit logging middleware.
 *
 * Usage:
 *   router.use(auditLogger());  // Applies to all subsequent routes
 *
 * Or for specific routes:
 *   router.put('/orders/:id', auditLogger(), controller.updateOrder);
 *
 * @param options.optional - If true, don't require admin authentication (for public endpoints)
 */
export const auditLogger = (options?: { optional?: boolean }) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only audit mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Skip if no authenticated user and not optional
    if (!req.user && !options?.optional) {
      return next();
    }

    // Capture request data before processing
    const action = buildActionName(req);
    const { resource, resourceId } = extractResourceInfo(req);
    const adminId = req.user?.id || null;
    const adminEmail = req.user?.full_name || req.user?.phone || 'unknown';
    const ip = (req.ip || req.headers['x-forwarded-for'] || null) as string | null;
    const userAgent = req.headers['user-agent'];
    const newData = req.body;

    // For PUT/PATCH, try to fetch old data before the change
    let oldData: unknown = null;
    if (['PUT', 'PATCH'].includes(req.method) && resourceId) {
      try {
        const tableMap: Record<string, string> = {
          orders: 'orders',
          products: 'products',
          riders: 'riders',
          categories: 'categories',
          'atta-requests': 'atta_requests',
          cities: 'service_cities',
        };

        const tableName = tableMap[resource];
        if (tableName) {
          const oldResult = await query(
            `SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`,
            [resourceId]
          );
          if (oldResult.rows.length > 0) {
            oldData = oldResult.rows[0];
          }
        }
      } catch (fetchError) {
        // Non-fatal: continue without old data
        logger.debug('Could not fetch old data for audit log', { resource, resourceId, error: fetchError });
      }
    }

    // Capture response status by intercepting res.end / res.json
    const originalJson = res.json.bind(res);
    let responseStatus: 'success' | 'failed' = 'success';
    let errorMessage: string | undefined;

    res.json = function (body: unknown) {
      // Check response for failure indicators
      const b = (body && typeof body === 'object' ? body : {}) as { success?: unknown; message?: unknown };
      if (body && (b.success === false || res.statusCode >= 400)) {
        responseStatus = 'failed';
        errorMessage = (typeof b.message === 'string' && b.message) || `HTTP ${res.statusCode}`;
      }
      return originalJson(body);
    };

    // Continue with request processing
    // We use res.on('finish') to log after response is sent
    res.on('finish', () => {
      const entry: AuditLogEntry = {
        action,
        adminId,
        adminEmail,
        resource,
        resourceId,
        oldData,
        newData: sanitizeData(newData),
        ip,
        userAgent,
        timestamp: new Date().toISOString(),
        status: responseStatus,
        errorMessage,
      };

      // Write audit log asynchronously (don't block)
      writeAuditLog(entry).catch((err) => {
        logger.error('Audit log write failed', { error: err, action });
      });
    });

    next();
  };
};

/**
 * Manual audit log function for non-HTTP-triggered admin actions
 * (e.g., scheduled jobs, background processing that affects admin-managed resources)
 */
export const logAdminAction = async (params: {
  action: string;
  adminId: string;
  adminEmail?: string;
  resource: string;
  resourceId?: string;
  oldData?: unknown;
  newData?: unknown;
  ip?: string;
  status?: 'success' | 'failed';
  errorMessage?: string;
}): Promise<void> => {
  const entry: AuditLogEntry = {
    action: params.action,
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    resource: params.resource,
    resourceId: params.resourceId,
    oldData: params.oldData ? sanitizeData(params.oldData) : undefined,
    newData: params.newData ? sanitizeData(params.newData) : undefined,
    ip: params.ip || null,
    timestamp: new Date().toISOString(),
    status: params.status || 'success',
    errorMessage: params.errorMessage,
  };

  await writeAuditLog(entry);
};

export default auditLogger;
