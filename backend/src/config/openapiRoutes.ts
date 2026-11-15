// ============================================================================
// OPENAPI PATHS FROM THE REAL ROUTER
//
// The Swagger page used to list no endpoint at all: it was built from JSDoc
// annotations and the code has none. Hand-written docs for ~350 routes would
// drift the day they were written. Instead, after the routes are mounted, the
// Express router itself is read and every route becomes an OpenAPI operation:
// method, path (":id" → "{id}" + a path parameter), a tag, and whether a
// sign-in is needed (seen from the auth middleware in front of the route).
// ============================================================================
import type { Application } from 'express';

export interface ExpressRoute {
  method: string;
  path: string;
  /** An auth middleware (authenticate / requireAdmin / …) runs before it. */
  auth: boolean;
}

/** Middleware that refuses requests without a valid sign-in (marked where they are defined). */
const AUTH_GUARDS = new WeakSet<object>();
export function markAuthGuard<T extends object>(fn: T): T {
  AUTH_GUARDS.add(fn);
  return fn;
}
const isGuard = (fn: unknown): boolean => typeof fn === 'function' && AUTH_GUARDS.has(fn);

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle?: unknown }> };
  name?: string;
  regexp?: RegExp;
  handle?: { stack?: Layer[] } & object;
};

/** "/^\/orders\/?(?=\/|$)/i" → "/orders" (Express 4 mount paths). */
function mountPath(layer: Layer): string {
  return String(layer.regexp?.source || '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/')
    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
}

/** Every route Express knows about, with :params intact. */
export function listExpressRoutes(app: Application): ExpressRoute[] {
  const out: ExpressRoute[] = [];
  const walk = (stack: Layer[], prefix: string, authAbove: boolean) => {
    let auth = authAbove;
    for (const layer of stack) {
      if (layer.route) {
        const own = layer.route.stack.some((h) => isGuard(h.handle));
        for (const method of Object.keys(layer.route.methods)) {
          if (method === '_all') continue;
          out.push({ method: method.toUpperCase(), path: prefix + layer.route.path, auth: auth || own });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer), auth);
      } else if (isGuard(layer.handle)) {
        // router.use(authenticate): everything after it in this router needs a sign-in.
        auth = true;
      }
    }
  };
  const root = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (root) walk(root.stack, '', false);
  return out;
}

type Operation = {
  tags: string[];
  summary: string;
  operationId: string;
  parameters?: Array<{ name: string; in: 'path'; required: true; schema: { type: 'string' } }>;
  security?: Array<Record<string, string[]>>;
  responses: Record<string, { description: string }>;
};

/** Adds every route that the spec does not already describe. Returns how many were added. */
export function addRoutesToSpec(spec: { paths?: Record<string, Record<string, unknown>> }, routes: ExpressRoute[]): number {
  spec.paths = spec.paths || {};
  let added = 0;
  for (const r of routes) {
    if (!r.path.startsWith('/api/')) continue;
    const params: string[] = [];
    const path = r.path.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => {
      params.push(name);
      return `{${name}}`;
    });
    const method = r.method.toLowerCase();
    const entry = (spec.paths[path] = spec.paths[path] || {});
    if (entry[method]) continue; // hand-written docs win
    const segments = path.split('/').filter(Boolean); // ["api", "admin", "orders", ...]
    const tag = segments[1] === 'admin' && segments[2] ? `admin/${segments[2]}` : segments[1] || 'api';
    const op: Operation = {
      tags: [tag],
      summary: `${r.method} ${path}`,
      operationId: `${method}_${path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      responses: {
        '200': { description: 'Success — `{ success: true, data, message }`' },
        '400': { description: 'Invalid input — `{ success: false, message }`' },
        ...(r.auth ? { '401': { description: 'Not signed in' }, '403': { description: 'Not allowed' } } : {}),
      },
    };
    if (params.length) op.parameters = params.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } }));
    if (r.auth) op.security = [{ bearerAuth: [] }];
    entry[method] = op;
    added++;
  }
  return added;
}
