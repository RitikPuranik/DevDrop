const Brevo = require('@getbrevo/brevo');
const apiInstance = require('../shared/config/email');
const { EMAIL_SUBJECTS } = require('../shared/utils/constants');

/**
 * Central send helper — uses Brevo HTTP API (works on Render/Vercel, no SMTP needed)
 */
const sendEmail = async ({ to, subject, html, from }) => {
  try {
    const defaultEmail = process.env.EMAIL_FROM || 'hello@devdrop.com';
    const displayName = from
      ? from.charAt(0).toUpperCase() + from.slice(1)
      : 'DevDrop';

    const sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.sender = { name: displayName, email: defaultEmail };
    sendSmtpEmail.to = Array.isArray(to)
      ? to.map((email) => ({ email }))
      : [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    console.log(`📧 Sending email: to=${Array.isArray(to) ? to.join(',') : to}, subject="${subject}", from=${defaultEmail}`);
    const info = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Email sent successfully: messageId=${info?.messageId || JSON.stringify(info)}`);
    return info;
  } catch (error) {
    const brevoError = error?.response?.body || error?.body || error;
    console.error('❌ Failed to send email with Brevo API:', JSON.stringify(brevoError, null, 2));
    console.error('   Brevo status:', error?.response?.status || error?.statusCode || 'unknown');
    console.error('   Check: 1) BREVO_API_KEY is valid  2) EMAIL_FROM is verified in Brevo  3) Brevo account is active');
    throw error;
  }
};

const sendVerificationEmail = async (user) => {
  try {
    const verificationToken = user.generateVerificationToken();
    await user.save();
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: user.email,
      from: 'accounts',
      subject: EMAIL_SUBJECTS.VERIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify Your Email</h2>
          <p>Hi ${user.name || 'there'}!</p>
          <p>Please verify your email address to complete your registration.</p>
          <div style="margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p>Or copy and paste this link:</p>
          <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
        </div>
      `,
    });
    console.log(`✅ Verification email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (user) => {
  try {
    await sendEmail({
      to: user.email,
      from: 'hello',
      subject: EMAIL_SUBJECTS.WELCOME,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to DevDrop! 🎉</h2>
          <p>Hi ${user.name || 'there'}!</p>
          <p>Your email has been verified. You can now:</p>
          <ul>
            <li>Browse and purchase websites</li>
            <li>List your own websites for sale</li>
            <li>Build your wishlist</li>
          </ul>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Go to Platform
            </a>
          </div>
        </div>
      `,
    });
    console.log(`✅ Welcome email sent to ${user.email}`);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

const sendPurchaseConfirmation = async (buyer, website, purchase) => {
  try {
    await sendEmail({
      to: buyer.email,
      from: 'receipts',
      subject: EMAIL_SUBJECTS.PURCHASE_CONFIRMATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Purchase Successful! 🎉</h2>
          <p>Hi ${buyer.name || buyer.email}!</p>
          <p>Your purchase has been confirmed.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Website Details</h3>
            <p><strong>Name:</strong> ${website.name}</p>
            <p><strong>Category:</strong> ${website.category}</p>
            ${purchase.totalPaid > 0 ? `<p><strong>Amount Paid:</strong> ₹${purchase.totalPaid}</p>` : ''}
          </div>
          <p>You can now access the source code, documentation, and video from your dashboard.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard/purchases" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Purchase
            </a>
          </div>
        </div>
      `,
    });
    console.log(`✅ Purchase confirmation sent to ${buyer.email}`);
  } catch (error) {
    console.error('Error sending purchase confirmation:', error);
  }
};

const sendSellerNotification = async (seller, website, purchase) => {
  try {
    await sendEmail({
      to: seller.email,
      from: 'sales',
      subject: EMAIL_SUBJECTS.SELLER_NOTIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your Website Has Been Sold! 🎉</h2>
          <p>Hi ${seller.name || seller.email}!</p>
          <p>Great news! Your website "${website.name}" has been purchased.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Website:</strong> ${website.name}</p>
            <p><strong>Your Earnings:</strong> ₹${purchase.sellerPrice}</p>
            <p><strong>Category:</strong> ${website.category}</p>
          </div>
          <p>Your payout will be processed shortly.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard/earnings" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Earnings
            </a>
          </div>
        </div>
      `,
    });
    console.log(`✅ Seller notification sent to ${seller.email}`);
  } catch (error) {
    console.error('Error sending seller notification:', error);
  }
};

const sendStatusUpdateEmail = async (seller, website, status, comment = '') => {
  try {
    const statusMessages = {
      approved: { title: 'Your Website Has Been Approved! ✅', message: 'Congratulations! Your website is now live on our platform.' },
      changes_requested: { title: 'Changes Requested for Your Website', message: 'Our team reviewed your website and requested some changes.' },
      rejected: { title: 'Website Submission Update', message: 'Unfortunately, your website submission was not approved.' },
    };

    const statusInfo = statusMessages[status] || {
      title: 'Website Status Update',
      message: `Your website status updated to: ${status}`,
    };

    await sendEmail({
      to: seller.email,
      from: 'review',
      subject: EMAIL_SUBJECTS.STATUS_UPDATE,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${statusInfo.title}</h2>
          <p>Hi ${seller.name || seller.email}!</p>
          <p>${statusInfo.message}</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Website:</strong> ${website.name}</p>
            <p><strong>Status:</strong> ${status.replace(/_/g, ' ').toUpperCase()}</p>
            ${comment ? `<p><strong>Admin Comment:</strong> ${comment}</p>` : ''}
          </div>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/template" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Website
            </a>
          </div>
        </div>
      `,
    });
    console.log(`✅ Status update email sent to ${seller.email}`);
  } catch (error) {
    console.error('Error sending status update email:', error);
  }
};

const sendPayoutNotification = async (seller, payout) => {
  try {
    await sendEmail({
      to: seller.email,
      from: 'finance',
      subject: EMAIL_SUBJECTS.PAYOUT_NOTIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payout Processed! 💰</h2>
          <p>Hi ${seller.name || seller.email}!</p>
          <p>Your payout has been processed successfully.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Amount:</strong> ₹${payout.amount}</p>
            <p><strong>Status:</strong> ${payout.status}</p>
            ${payout.utr ? `<p><strong>UTR:</strong> ${payout.utr}</p>` : ''}
            ${payout.transactionDate ? `<p><strong>Date:</strong> ${new Date(payout.transactionDate).toLocaleDateString('en-IN')}</p>` : ''}
            ${payout.bankName ? `<p><strong>Bank:</strong> ${payout.bankName}</p>` : ''}
            ${payout.websiteName ? `<p><strong>Website:</strong> ${payout.websiteName}</p>` : ''}
          </div>
          <p>Amount should reflect in your account within 30 minutes (IMPS).</p>
        </div>
      `,
    });
    console.log(`✅ Payout notification sent to ${seller.email}`);
  } catch (error) {
    console.error('Error sending payout notification:', error);
  }
};

const sendPasswordResetEmail = async (user, token) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      from: 'security',
      subject: EMAIL_SUBJECTS.PASSWORD_RESET,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset Your Password</h2>
          <p>Hi ${user.name || user.email}!</p>
          <p>Click the link below to reset your password:</p>
          <div style="margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste: <span style="color: #666; word-break: break-all;">${resetUrl}</span></p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    console.log(`✅ Password reset email sent to ${user.email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

const sendAdminAlert = async ({ subject, message, error, details }) => {
  try {
    const adminEmails = process.env.ADMIN_EMAILS
      ? process.env.ADMIN_EMAILS.split(',').map((e) => e.trim())
      : ['admin@devdrop.com'];

    await sendEmail({
      to: adminEmails,
      from: 'system',
      subject: `🚨 ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #dc2626;">Admin Alert</h2>
          <p><strong>${message}</strong></p>
          ${error ? `<div style="background-color: #fee2e2; padding: 15px; border-radius: 5px; margin: 10px 0;"><p><strong>Error:</strong> ${error}</p></div>` : ''}
          ${details ? `<div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 10px 0;"><p style="white-space: pre-line;"><strong>Details:</strong><br>${details}</p></div>` : ''}
          <p style="margin-top: 20px;">Please check the admin dashboard.</p>
          <hr>
          <p style="color: #6b7280; font-size: 12px;">Automated message from DevDrop.</p>
        </div>
      `,
    });
    console.log(`✅ Admin alert sent: ${subject}`);
  } catch (err) {
    console.error('Error sending admin alert:', err);
  }
};

const sendOutbidNotification = async (previousBidder, website, newBidAmount) => {
  try {
    await sendEmail({
      to: previousBidder.email,
      from: 'auctions',
      subject: EMAIL_SUBJECTS.OUTBID_NOTIFICATION,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've Been Outbid! ⚡</h2>
          <p>Hi ${previousBidder.name || previousBidder.email}!</p>
          <p>Someone has placed a higher bid on <strong>"${website.name}"</strong>.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Website:</strong> ${website.name}</p>
            <p><strong>New Highest Bid:</strong> ₹${newBidAmount}</p>
          </div>
          <p>Don't miss out! Place a higher bid now to stay in the running.</p>
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/exclusive/${website._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Place a Higher Bid
            </a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">If you no longer wish to participate in this auction, you can ignore this email.</p>
        </div>
      `,
    });
    console.log(`✅ Outbid notification sent to ${previousBidder.email}`);
  } catch (error) {
    console.error('Error sending outbid notification:', error);
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
  sendAdminAlert,
  sendOutbidNotification,
};