// ============================================================================
// CATEGORY ROUTES
// ============================================================================

import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { optionalAuth } from '../middleware';

const router = Router();

// Public routes
router.get('/', optionalAuth, categoryController.getCategories);
router.get('/tree', optionalAuth, categoryController.getCategoryTree);
router.get('/:slug', optionalAuth, categoryController.getCategoryBySlug);

export default router;
