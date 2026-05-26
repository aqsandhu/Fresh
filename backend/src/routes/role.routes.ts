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
} from '../middleware';
import * as roleController from '../controllers/role.controller';

const router = Router();

router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/permissions', roleController.listPermissions);
router.get('/', roleController.listRoles);
router.post('/', roleController.createRole);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);
router.put('/assign/:id', roleController.assignRoleToUser);
router.get('/users', roleController.listAdminUsers);
router.post('/users', roleController.createAdminUser);

export default router;
