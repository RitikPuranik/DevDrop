const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const contactController = require('./contact.controller');
const { handleValidationErrors } = require('../../shared/utils/validators');

// POST /api/contact — public, no auth required
router.post(
  '/',
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('phone')
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit phone number'),
    body('message')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Message cannot exceed 2000 characters'),
    handleValidationErrors,
  ],
  contactController.submitContact
);

// GET /api/contact — list all (for admin dashboard later)
router.get('/', contactController.getAllContacts);

module.exports = router;
