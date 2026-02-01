const transporter = require('../config/email');
const { EMAIL_SUBJECTS } = require('../utils/constants');
const crypto = require('crypto');

/**
 * Send verification email
 */
const sendVerificationEmail = async (user) => {
  try {
    // Generate verification token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: EMAIL_SUBJECTS.VERIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify Your Email</h2>
          <p>Hi there!</p>
          <p>Please verify your email address to complete your registration and start using our platform.</p>
          <div style="margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This link will expire in 24 hours. If you didn't create an account, please ignore this email.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${user.email}`);
    
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

/**
 * Send welcome email after verification
 */
const sendWelcomeEmail = async (user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: EMAIL_SUBJECTS.WELCOME,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Marketplace Platform! 🎉</h2>
          <p>Hi there!</p>
          <p>Your email has been successfully verified. You can now:</p>
          <ul>
            <li>Browse and purchase websites</li>
            <li>List your own websites for sale</li>
            <li>Build your wishlist</li>
          </ul>
          <p>Start exploring now!</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Go to Platform
            </a>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${user.email}`);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

/**
 * Send purchase confirmation to buyer
 */
const sendPurchaseConfirmation = async (buyer, website, purchase) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: buyer.email,
      subject: EMAIL_SUBJECTS.PURCHASE_CONFIRMATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Purchase Successful! 🎉</h2>
          <p>Hi ${buyer.email}!</p>
          <p>Your purchase has been confirmed.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Website Details</h3>
            <p><strong>Name:</strong> ${website.name}</p>
            <p><strong>Category:</strong> ${website.category}</p>
            ${purchase.totalPaid > 0 ? `<p><strong>Amount Paid:</strong> ₹${purchase.totalPaid}</p>` : ''}
          </div>
          <p>You can now access the source code, documentation, and video from your dashboard.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard/purchases" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Purchase
            </a>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Purchase confirmation sent to ${buyer.email}`);
  } catch (error) {
    console.error('Error sending purchase confirmation:', error);
  }
};

/**
 * Send sale notification to seller
 */
const sendSellerNotification = async (seller, website, purchase) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: seller.email,
      subject: EMAIL_SUBJECTS.SELLER_NOTIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Congratulations! Your Website Has Been Sold! 🎉</h2>
          <p>Hi there!</p>
          <p>Great news! Your website "${website.name}" has been purchased.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Sale Details</h3>
            <p><strong>Website:</strong> ${website.name}</p>
            <p><strong>Your Earnings:</strong> ₹${purchase.sellerPrice}</p>
            <p><strong>Category:</strong> ${website.category}</p>
          </div>
          <p>Your payout will be processed shortly. You can track it in your dashboard.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard/earnings" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Earnings
            </a>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Seller notification sent to ${seller.email}`);
  } catch (error) {
    console.error('Error sending seller notification:', error);
  }
};

/**
 * Send status update email
 */
const sendStatusUpdateEmail = async (seller, website, status, comment = '') => {
  try {
    const statusMessages = {
      approved: {
        title: 'Your Website Has Been Approved! ✅',
        message: 'Congratulations! Your website has been approved and is now live on our platform.',
      },
      changes_requested: {
        title: 'Changes Requested for Your Website',
        message: 'Our team has reviewed your website and requested some changes.',
      },
      rejected: {
        title: 'Website Submission Update',
        message: 'Unfortunately, your website submission was not approved.',
      },
    };

    const statusInfo = statusMessages[status];

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: seller.email,
      subject: EMAIL_SUBJECTS.STATUS_UPDATE,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${statusInfo.title}</h2>
          <p>Hi there!</p>
          <p>${statusInfo.message}</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Website:</strong> ${website.name}</p>
            <p><strong>Status:</strong> ${status.replace('_', ' ').toUpperCase()}</p>
            ${comment ? `<p><strong>Admin Comment:</strong> ${comment}</p>` : ''}
          </div>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard/websites" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Website
            </a>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Status update email sent to ${seller.email}`);
  } catch (error) {
    console.error('Error sending status update email:', error);
  }
};

/**
 * Send payout notification
 */
const sendPayoutNotification = async (seller, payout) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: seller.email,
      subject: EMAIL_SUBJECTS.PAYOUT_NOTIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payout Processed! 💰</h2>
          <p>Hi there!</p>
          <p>Your payout has been processed successfully.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Amount:</strong> ₹${payout.amount}</p>
            <p><strong>Status:</strong> ${payout.status}</p>
            ${payout.utr ? `<p><strong>UTR:</strong> ${payout.utr}</p>` : ''}
            ${payout.transactionDate ? `<p><strong>Date:</strong> ${new Date(payout.transactionDate).toLocaleDateString()}</p>` : ''}
          </div>
          <p>The amount should reflect in your account within 2-3 business days.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Payout notification sent to ${seller.email}`);
  } catch (error) {
    console.error('Error sending payout notification:', error);
  }
};

const sendPasswordResetEmail = async (user, token) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: EMAIL_SUBJECTS.PASSWORD_RESET,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Click the link below to reset your password:</p>
          <div style="margin: 30px 0;">
            <a href="${resetUrl}"
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
              Reset Password
            </a>
          </div>
          <p>This link expires in 15 minutes.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${user.email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};


module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPurchaseConfirmation,
  sendSellerNotification,
  sendStatusUpdateEmail,
  sendPayoutNotification,
  sendPasswordResetEmail,
};