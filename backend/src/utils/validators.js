const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation result handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  
  next();
};

/**
 * Common validation rules
 */
const validators = {
  name: () =>
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),

  phone: () =>
    body('phone')
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit phone number'),
      
  // Email validation
  email: () => 
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),

  // Password validation
  password: () =>
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),

  // MongoDB ObjectId validation
  mongoId: (field = 'id') =>
    param(field)
      .isMongoId()
      .withMessage('Invalid ID format'),

  // Website name validation
  websiteName: () =>
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Website name must be 3-100 characters'),

  // Description validation
  description: () =>
    body('description')
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be 10-2000 characters'),

  // Category validation
  category: () =>
    body('category')
      .isIn(['free', 'paid', 'exclusive'])
      .withMessage('Category must be free, paid, or exclusive'),

  // Price validation
  price: () =>
    body('price')
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),

  // URL validation
  url: (field = 'url') =>
    body(field)
      .isURL({ protocols: ['http', 'https'] })
      .withMessage('Please provide a valid URL'),

  // Bank account validation
  accountNumber: () =>
    body('accountNumber')
      .isNumeric()
      .isLength({ min: 9, max: 18 })
      .withMessage('Invalid account number'),

  // IFSC code validation
  ifscCode: () =>
    body('ifscCode')
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Invalid IFSC code format'),

  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
};

module.exports = {
  handleValidationErrors,
  validators,
};