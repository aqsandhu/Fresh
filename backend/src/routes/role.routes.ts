// ============================================================================
// ADMIN ROLES ROUTES
// ============================================================================
// Mounted at /api/admin/roles. Only super-admins (or admins with the legacy
// `super_admin` enum role) can manage roles for now — once a `roles.manage`
// permission is wired into the permission middleware we can relax this to
// "anyone with roles.manage".
// ============================================================================

import { Router } from 'express';
import {
  authenticate,
  requireSuperAdmin,
  verifyAdminActive,
  auditLogger,
} from '../middleware';
import * as roleController from '../controllers/role.controller';

const router = Router();

router.use(authenticate);
router.use(requireSuperAdmin);
// Mirror admin.routes.ts: a suspended/demoted admin's role-management access
// must end immediately (not at JWT expiry), and every role/user mutation must
// land in the audit log.
router.use(verifyAdminActive);
router.use(auditLogger());

router.get('/permissions', roleController.listPermissions);
router.get('/', roleController.listRoles);
router.post('/', roleController.createRole);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);
router.put('/assign/:id', roleController.assignRoleToUser);
router.get('/users', roleController.listAdminUsers);
router.post('/users', roleController.createAdminUser);
router.put('/users/:id', roleController.updateAdminUser);
router.delete('/users/:id', roleController.deleteAdminUser);

export default router;
