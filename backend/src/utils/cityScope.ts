// ============================================================================
// CITY SCOPE — resolves which service city an admin request applies to.
// Super-admins pick a city via X-City-Id header; scoped admins are locked to
// their role's city_id.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

export interface CityScope {
  cityId: string | null;
  cityName: string | null;
  /** When true, list endpoints return all cities (legacy admin or super-admin without filter). */
  unrestricted: boolean;
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
  if (!user) {
    return { cityId: null, cityName: null, unrestricted: true };
  }

  if (user.role === 'super_admin') {
    const headerId = (req.headers['x-city-id'] as string | undefined)?.trim();
    const queryId =
      typeof req.query.city_id === 'string' ? req.query.city_id.trim() : null;
    const cityId = headerId || queryId || null;
    if (!cityId) {
      return { cityId: null, cityName: null, unrestricted: true };
    }

    const row = await query(
      'SELECT id, name FROM service_cities WHERE id = $1',
      [cityId]
    );
    if (!row.rows[0]) {
      return { cityId: null, cityName: null, unrestricted: true };
    }
    return {
      cityId: row.rows[0].id,
      cityName: row.rows[0].name,
      unrestricted: false,
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
    };
  }

  return { cityId: null, cityName: null, unrestricted: true };
}

/** Append `AND alias.city_id = $n` when the request is city-scoped. */
export function cityIdClause(
  scope: CityScope,
  alias: string,
  params: unknown[],
  paramIndex: number
): { sql: string; nextIndex: number } {
  if (scope.unrestricted || !scope.cityId) {
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
  if (scope.unrestricted || !scope.cityId) {
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
): { sql: string; nextIndex: number } {
  if (scope.unrestricted || !scope.cityId || !scope.cityName) {
    return { sql: '', nextIndex: paramIndex };
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
         WHERE o.user_id = ${userAlias}.id
           AND o.deleted_at IS NULL
           AND o.city_id = $${idParam}
      )
    )`,
    nextIndex: paramIndex,
  };
}

export const attachCityScope = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    req.cityScope = await resolveCityScope(req);
    next();
  } catch (err) {
    next(err);
  }
};

export function requireCityScope(scope: CityScope): string | null {
  if (scope.unrestricted || !scope.cityId) {
    return 'Select a city before creating or updating catalog data';
  }
  return null;
}
