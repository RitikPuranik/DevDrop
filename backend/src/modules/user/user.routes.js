const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const userController = require('./user.controller');
const bankSetupController = require('./bankSetup.controller');
const { uploadAvatar, handleMulterError } = require('../../shared/middleware/uploadValidation');

router.use(auth);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/profile/avatar', uploadAvatar.single('avatar'), handleMulterError, userController.updateProfilePicture);
router.delete('/profile/avatar', userController.removeProfilePicture);
router.get('/dashboard', userController.getDashboard);
router.get('/purchases', userController.getPurchases);

router.get('/bank-details', userController.getBankDetails);
router.post('/bank-details', userController.saveBankDetails);
router.post('/bank-details/setup-payouts', bankSetupController.setupBankPayouts);
router.post('/bank-details/setup-upi', bankSetupController.setupUPIPayouts);
router.get('/bank-details/payout-status', bankSetupController.getPayoutSetupStatus);
router.post('/bank-details/toggle-payouts', bankSetupController.togglePayouts);

module.exports = router;

