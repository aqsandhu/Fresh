// API docs are built from the REAL router: every route appears, with its path
// parameters and whether a sign-in is needed.
import express, { Router } from 'express';
import { addRoutesToSpec, listExpressRoutes, markAuthGuard } from '../../src/config/openapiRoutes';

const guard = markAuthGuard((_req: express.Request, _res: express.Response, next: express.NextFunction) => next());
const ok = (_req: express.Request, res: express.Response) => res.json({});

function app() {
  const a = express();
  const products = Router();
  products.get('/', ok);
  products.get('/:id', ok);
  const orders = Router();
  orders.get('/track/:orderNumber', ok); // before the guard: public
  orders.use(guard);
  orders.get('/', ok);
  orders.post('/:id/cancel', ok);
  const admin = Router();
  const adminOrders = Router();
  adminOrders.put('/:id/status', ok);
  admin.use(guard);
  admin.use('/orders', adminOrders);
  const api = Router();
  api.use('/products', products);
  api.use('/orders', orders);
  api.use('/admin', admin);
  api.post('/reviews', guard, ok); // guard on the route itself
  a.use('/api', api);
  return a;
}

it('lists every route with its auth', () => {
  const routes = listExpressRoutes(app());
  const by = (m: string, p: string) => routes.find((r) => r.method === m && r.path === p);
  expect(by('GET', '/api/products/')?.auth).toBe(false);
  expect(by('GET', '/api/orders/track/:orderNumber')?.auth).toBe(false);
  expect(by('GET', '/api/orders/')?.auth).toBe(true);
  expect(by('POST', '/api/orders/:id/cancel')?.auth).toBe(true);
  expect(by('PUT', '/api/admin/orders/:id/status')?.auth).toBe(true);
  expect(by('POST', '/api/reviews')?.auth).toBe(true);
  expect(routes).toHaveLength(7);
});

it('turns them into OpenAPI operations without overwriting hand-written ones', () => {
  const spec: { paths: Record<string, Record<string, any>> } = { paths: { '/api/products/{id}': { get: { summary: 'hand written' } } } };
  const added = addRoutesToSpec(spec, listExpressRoutes(app()));
  expect(added).toBe(6);
  expect(spec.paths['/api/products/{id}'].get.summary).toBe('hand written');
  const cancel = spec.paths['/api/orders/{id}/cancel'].post;
  expect(cancel.parameters).toEqual([{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]);
  expect(cancel.security).toEqual([{ bearerAuth: [] }]);
  expect(spec.paths['/api/orders/track/{orderNumber}'].get.security).toBeUndefined();
  expect(spec.paths['/api/admin/orders/{id}/status'].put.tags).toEqual(['admin/orders']);
});
