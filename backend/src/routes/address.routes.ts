// ============================================================================
// ADDRESS ROUTES
// ============================================================================

import { Router } from 'express';
import * as addressController from '../controllers/address.controller';
import {
  authenticate,
  validate,
  addressSchemas,
  uploadDoorPicture,
  handleUploadError,
} from '../middleware';

const router = Router();

// All address routes require authentication
router.use(authenticate);

router.get('/', addressController.getAddresses);
router.get('/:id', addressController.getAddressById);
router.post(
  '/',
  uploadDoorPicture,
  handleUploadError,
  validate(addressSchemas.create),
  addressController.createAddress
);
router.put(
  '/:id',
  uploadDoorPicture,
  handleUploadError,
  validate(addressSchemas.update),
  addressController.updateAddress
);
router.delete('/:id', addressController.deleteAddress);
router.put('/:id/set-default', addressController.setDefaultAddress);

export default router;
