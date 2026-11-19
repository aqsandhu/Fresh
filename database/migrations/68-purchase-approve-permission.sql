-- ============================================================================
-- 68 — Permission to approve stock purchases entered by staff (owner decision J1).
--
-- Roles that could already enter purchases and are city-scoped managers keep
-- working as before: every role that holds BOTH "enter purchases" and the
-- ability to manage admins/roles-level finance (profit view) is given the new
-- permission, so an existing city admin is not locked out of their own queue.
-- A plain staff role (enter purchases only) is NOT given it — its entries wait.
-- ============================================================================
INSERT INTO permissions (code, description, category) VALUES
  ('finance.stock_purchase.approve', 'Approve stock purchases entered by staff (own entries apply at once)', 'Finance')
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT DISTINCT a.role_id, ap.id
  FROM admin_role_permissions a
  JOIN permissions pc ON pc.id = a.permission_id AND pc.code = 'finance.stock_purchase.create'
  JOIN admin_role_permissions b ON b.role_id = a.role_id
  JOIN permissions pv ON pv.id = b.permission_id AND pv.code = 'finance.profit.view'
  CROSS JOIN (SELECT id FROM permissions WHERE code = 'finance.stock_purchase.approve') ap
ON CONFLICT DO NOTHING;
