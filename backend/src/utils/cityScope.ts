// ============================================================================
// CITY SCOPE — resolves which service city an admin request applies to.
// Super-admins pick a city via X-City-Id header; scoped admins are locked to
// their role's city_id.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { ForbiddenError } from '../middleware/errorHandler';

export interface CityScope {
  cityId: string | null;
  cityName: string | null;
  /** When true, list endpoints return all cities (legacy admin or super-admin without filter). */
  unrestricted: boolean;
  /** false until migration 04 is applied — city_id filters are skipped so data still loads. */
  dbReady: boolean;
  /**
   * FAIL-CLOSED: true when a city-scoped admin has NO resolvable city (e.g. a
   * role with no city assigned). Such an admin must see NOTHING, never every
   * city. The middleware rejects these requests; the helpers also treat this
   * as "match no rows" as defence-in-depth.
   */
  forbidden?: boolean;
}

let cachedCityColumns: boolean | null = null;

async function hasCityScopeColumns(): Promise<boolean> {
  if (cachedCityColumns !== null) return cachedCityColumns;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'city_id'
       LIMIT 1`
    );
    cachedCityColumns = r.rows.length > 0;
  } catch {
    cachedCityColumns = false;
  }
  return cachedCityColumns;
}

declare global {
  namespace Express {
    interface Request {
      cityScope?: CityScope;
    }
  }
}

export async function resolveCityScope(req: Request): Promise<CityScope> {
  const user = req.user;
  const dbReady = await hasCityScopeColumns();

  if (!user) {
    return { cityId: null, cityName: null, unrestricted: true, dbReady };
  }

  if (user.role === 'super_admin') {
    const headerId = (req.headers['x-city-id'] as string | undefined)?.trim();
    const queryId =
      typeof req.query.city_id === 'string' ? req.query.city_id.trim() : null;
    const cityId = headerId || queryId || null;
    if (!cityId) {
      return { cityId: null, cityName: null, unrestricted: true, dbReady };
    }

    const row = await query(
      'SELECT id, name FROM service_cities WHERE id = $1',
      [cityId]
    );
    if (!row.rows[0]) {
      return { cityId: null, cityName: null, unrestricted: true, dbReady };
    }
    return {
      cityId: row.rows[0].id,
      cityName: row.rows[0].name,
      unrestricted: false,
      dbReady,
    };
  }

  const result = await query(
    `SELECT sc.id, sc.name
       FROM users u
       JOIN admin_roles r ON r.id = u.admin_role_id
       LEFT JOIN service_cities sc ON sc.id = COALESCE(
         r.city_id,
         (SELECT id FROM service_cities WHERE LOWER(name) = LOWER(r.city) LIMIT 1)
       )
      WHERE u.id = $1`,
    [user.id]
  );

  const row = result.rows[0];
  if (row?.id) {
    return {
      cityId: row.id,
      cityName: row.name,
      unrestricted: false,
      dbReady,
    };
  }

  // A non-super admin whose role resolves to NO city is a misconfiguration.
  // Once city scoping is live (dbReady), fail CLOSED — deny rather than hand
  // them every city's data. Before migration 04 there are no city columns to
  // isolate, so the legacy unrestricted behaviour is kept.
  if (dbReady) {
    return { cityId: null, cityName: null, unrestricted: false, dbReady, forbidden: true };
  }
  return { cityId: null, cityName: null, unrestricted: true, dbReady };
}

/** Append `AND alias.city_id = $n` when the request is city-scoped. */
export function cityIdClause(
  scope: CityScope,
  alias: string,
  params: unknown[],
  paramIndex: number
): { sql: string; nextIndex: number } {
  if (scope.forbidden) {
    return { sql: ' AND FALSE', nextIndex: paramIndex };
  }
  if (scope.unrestricted || !scope.cityId || !scope.dbReady) {
    return { sql: '', nextIndex: paramIndex };
  }
  params.push(scope.cityId);
  return {
    sql: ` AND ${alias}.city_id = $${paramIndex}`,
    nextIndex: paramIndex + 1,
  };
}

/** Orders may predate city_id — also match delivery address city name. */
export function orderCityClause(
  scope: CityScope,
  orderAlias: string,
  addressAlias: string,
  params: unknown[],
  paramIndex: number
): { sql: string; nextIndex: number } {
  if (scope.forbidden) {
    return { sql: ' AND FALSE', nextIndex: paramIndex };
  }
  if (scope.unrestricted || !scope.cityId || !scope.dbReady) {
    return { sql: '', nextIndex: paramIndex };
  }
  params.push(scope.cityId);
  const idParam = paramIndex++;
  params.push(scope.cityName);
  const nameParam = paramIndex++;
  return {
    sql: ` AND (
      ${orderAlias}.city_id = $${idParam}
      OR LOWER(COALESCE(${addressAlias}.city, '')) = LOWER($${nameParam})
      OR LOWER(COALESCE(${orderAlias}.delivery_address_snapshot->>'city', '')) = LOWER($${nameParam})
    )`,
    nextIndex: paramIndex,
  };
}

/** Customers with an address or order in the scoped city. */
export function customerCityExistsClause(
  scope: CityScope,
  userAlias: string,
  params: unknown[],
  paramIndex: number
): { sql: string; nextIndex: number; cityIdParam: number | null; cityNameParam: number | null } {
  if (scope.forbidden) {
    return { sql: ' AND FALSE', nextIndex: paramIndex, cityIdParam: null, cityNameParam: null };
  }
  if (scope.unrestricted || !scope.cityId || !scope.cityName || !scope.dbReady) {
    return { sql: '', nextIndex: paramIndex, cityIdParam: null, cityNameParam: null };
  }
  params.push(scope.cityName);
  const nameParam = paramIndex++;
  params.push(scope.cityId);
  const idParam = paramIndex++;
  return {
    sql: ` AND (
      EXISTS (
        SELECT 1 FROM addresses a
         WHERE a.user_id = ${userAlias}.id
           AND a.deleted_at IS NULL
           AND LOWER(a.city) = LOWER($${nameParam})
      )
      OR EXISTS (
        SELECT 1 FROM orders o
         LEFT JOIN addresses oaddr ON o.address_id = oaddr.id
         WHERE o.user_id = ${userAlias}.id
           AND o.deleted_at IS NULL
           AND (
             o.city_id = $${idParam}
             OR LOWER(COALESCE(oaddr.city, '')) = LOWER($${nameParam})
             OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER($${nameParam})
           )
      )
    )`,
    nextIndex: paramIndex,
    cityIdParam: idParam,
    cityNameParam: nameParam,
  };
}

/** Reusable order filter for correlated subqueries when city params are already bound. */
export function orderCityMatchSql(
  cityIdParam: number | null,
  cityNameParam: number | null,
  orderAlias: string,
  addressAlias: string
): string {
  if (!cityIdParam || !cityNameParam) return '';
  return ` AND (
    ${orderAlias}.city_id = $${cityIdParam}
    OR LOWER(COALESCE(${addressAlias}.city, '')) = LOWER($${cityNameParam})
    OR LOWER(COALESCE(${orderAlias}.delivery_address_snapshot->>'city', '')) = LOWER($${cityNameParam})
  )`;
}

/** Reusable address filter for correlated subqueries when city name param is already bound. */
export function addressCityMatchSql(
  cityNameParam: number | null,
  addressAlias: string
): string {
  if (!cityNameParam) return '';
  return ` AND LOWER(${addressAlias}.city) = LOWER($${cityNameParam})`;
}

/** Standalone WHERE fragment for listing addresses in the scoped city. */
export function addressCityWhereClause(
  scope: CityScope,
  addressAlias: string,
  params: unknown[],
  paramIndex: number
): { sql: string; nextIndex: number } {
  if (scope.forbidden) {
    return { sql: ' AND FALSE', nextIndex: paramIndex };
  }
  if (scope.unrestricted || !scope.cityName || !scope.dbReady) {
    return { sql: '', nextIndex: paramIndex };
  }
  params.push(scope.cityName);
  return {
    sql: ` AND LOWER(${addressAlias}.city) = LOWER($${paramIndex})`,
    nextIndex: paramIndex + 1,
  };
}

export const attachCityScope = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const scope = await resolveCityScope(req);
    req.cityScope = scope;
    // Fail closed: a scoped admin with no assigned city is denied outright
    // rather than silently granted access to every city's data.
    if (scope.forbidden) {
      return next(
        new ForbiddenError(
          'Your admin account is not assigned to a city. Ask a super admin to assign one.'
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
};

export function requireCityScope(scope: CityScope): string | null {
  if (scope.forbidden) {
    return 'Your admin account is not assigned to a city. Ask a super admin to assign one.';
  }
  if (scope.unrestricted || !scope.cityId) {
    return 'Select a city before creating or updating catalog data';
  }
  return null;
}

/**
 * May a (possibly city-scoped) admin touch a catalog row that belongs to
 * rowCityId? Unrestricted admins always pass; scoped admins only their city.
 * Used by by-ID read/update/delete endpoints — list endpoints filter in SQL.
 */
export function cityRowInScope(scope: CityScope, rowCityId: string | null): boolean {
  if (scope.forbidden) return false;
  if (scope.unrestricted || !scope.cityId || !scope.dbReady) return true;
  return rowCityId === scope.cityId;
}

/**
 * Same triple-condition city match the order LIST endpoints use (city_id OR
 * address city OR snapshot city), applied to a single order for by-ID routes.
 */
export async function orderInScope(scope: CityScope, orderId: string): Promise<boolean> {
  if (scope.forbidden) return false;
  if (scope.unrestricted || !scope.cityId || !scope.cityName || !scope.dbReady) return true;
  const r = await query(
    `SELECT 1 FROM orders o
       LEFT JOIN addresses addr ON o.address_id = addr.id
      WHERE o.id = $1
        AND (
          o.city_id = $2
          OR LOWER(COALESCE(addr.city, '')) = LOWER($3)
          OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER($3)
        )
      LIMIT 1`,
    [orderId, scope.cityId, scope.cityName]
  );
  return r.rows.length > 0;
}

/** Public catalog + banner: resolve city from query string. */
export async function resolvePublicCityId(req: Request): Promise<string | null> {
  const cityId = typeof req.query.city_id === 'string' ? req.query.city_id.trim() : null;
  if (cityId) return cityId;

  const cityName = typeof req.query.city === 'string' ? req.query.city.trim() : null;
  if (!cityName) return null;

  const row = await query(
    'SELECT id FROM service_cities WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1',
    [cityName]
  );
  return row.rows[0]?.id || null;
}
