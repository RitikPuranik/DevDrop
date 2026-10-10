const Contact = require('./contact.model');
const emailService = require('../../services/email.service');

/**
 * POST /api/contact
 * Submit a contact-us enquiry
 */
exports.submitContact = async (req, res, next) => {
  try {
    const { name, email, phone, message } = req.body;

    const contact = await Contact.create({
      name,
      email,
      phone,
      message: message || '',
    });

    // Send an email notification to the admins
    emailService.sendAdminAlert({
      subject: 'New Contact Us Enquiry',
      message: `A new enquiry has been submitted by ${name}.`,
      details: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message || 'No message provided.'}`
    }).catch(err => console.error('Failed to send contact admin alert:', err));


    res.status(201).json({
      success: true,
      message: 'Your enquiry has been submitted successfully. We will get back to you soon!',
      data: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/contact
 * List all contact submissions (admin use)
 */
exports.getAllContacts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Contact.countDocuments(),
    ]);

    res.json({
      success: true,
      data: contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};
