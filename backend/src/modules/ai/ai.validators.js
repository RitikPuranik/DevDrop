const { body } = require('express-validator');
const { handleValidationErrors } = require('../../shared/utils/validators');

// Mirrors ai-service/routes/planning.py::PortfolioPlanningRequest exactly.
// The frontend collects a few extra fields (targetAudience, primaryGoal,
// contact) for the review screen's own clarity, but ONLY the fields below
// are forwarded to the AI service — see Section 9/39: don't let the
// frontend invent values the AI service doesn't accept.
const SUPPORTED_WEBSITE_TYPES = ['portfolio'];
const SUPPORTED_THEMES = ['light', 'dark', 'auto'];
const SUPPORTED_STYLES = ['minimal', 'modern', 'professional', 'creative'];

const validatePortfolioGenerationRequest = [
  body('websiteType')
    .optional()
    .isIn(SUPPORTED_WEBSITE_TYPES)
    .withMessage(`websiteType must be one of: ${SUPPORTED_WEBSITE_TYPES.join(', ')}`),

  body('userData').isObject().withMessage('userData is required'),
  body('userData.name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('userData.role').trim().isLength({ min: 2, max: 100 }).withMessage('Role must be 2-100 characters'),
  body('userData.bio').optional({ nullable: true }).isLength({ max: 2000 }).withMessage('Bio must be under 2000 characters'),

  body('userData.skills').optional().isArray({ max: 50 }).withMessage('skills must be an array'),
  body('userData.skills.*').optional().isString().isLength({ max: 60 }),

  body('userData.projects').optional().isArray({ max: 20 }).withMessage('projects must be an array'),
  body('userData.projects.*.title').if(body('userData.projects').exists()).trim().notEmpty().isLength({ max: 120 })
    .withMessage('Each project needs a title under 120 characters'),
  body('userData.projects.*.description').optional({ nullable: true }).isLength({ max: 1000 }),
  body('userData.projects.*.link').optional({ nullable: true }).isURL().withMessage('Project link must be a valid URL'),

  body('userData.socialLinks').optional().isObject(),
  body('userData.socialLinks.github').optional({ nullable: true }).isURL().withMessage('GitHub link must be a valid URL'),
  body('userData.socialLinks.linkedin').optional({ nullable: true }).isURL().withMessage('LinkedIn link must be a valid URL'),

  body('preferences').optional().isObject(),
  body('preferences.theme').optional({ nullable: true }).isIn(SUPPORTED_THEMES)
    .withMessage(`theme must be one of: ${SUPPORTED_THEMES.join(', ')}`),
  body('preferences.style').optional({ nullable: true }).isIn(SUPPORTED_STYLES)
    .withMessage(`style must be one of: ${SUPPORTED_STYLES.join(', ')}`),
  body('preferences.animations').optional({ nullable: true }).isBoolean().withMessage('animations must be true or false'),

  body('assets').optional().isArray({ max: 20 }),
  body('assets.*.type').optional().isString().isLength({ max: 40 }),
  body('assets.*.url').optional().isURL(),
  body('assets.*.name').optional().isString().isLength({ max: 200 }),

  handleValidationErrors,
];

module.exports = { validatePortfolioGenerationRequest, SUPPORTED_WEBSITE_TYPES, SUPPORTED_THEMES, SUPPORTED_STYLES };
