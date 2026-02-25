const BankDetails = require('../models/BankDetails');
const User = require('../models/User');
const razorpayService = require('../services/razorpayService');

/**
 * @route   POST /api/user/bank-details/setup-payouts
 * @desc    Setup RazorpayX for automatic payouts (when user wants to sell)
 * @access  Private (Any user can setup to become seller)
 */
const setupRazorpayPayouts = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get existing bank details
    let bankDetails = await BankDetails.findOne({ userId });

    if (!bankDetails) {
      return res.status(400).json({
        success: false,
        message: 'Please save your bank details first using /api/user/bank-details',
      });
    }

    try {
      console.log(`🚀 Setting up Razorpay payouts for user: ${user.email}`);

      // Step 1: Create contact in Razorpay
      const contact = await razorpayService.createContact(
        bankDetails.accountHolderName,
        user.email,
        user.phone || '9999999999',
        'vendor'
      );

      console.log(`✅ Razorpay contact created: ${contact.id}`);

      // Step 2: Create fund account (bank account)
      const fundAccount = await razorpayService.createFundAccount(
        contact.id,
        'bank_account',
        {
          bank_account: {
            name: bankDetails.accountHolderName,
            ifsc: bankDetails.ifscCode,
            account_number: bankDetails.accountNumber,
          },
        }
      );

      console.log(`✅ Razorpay fund account created: ${fundAccount.id}`);

      // Step 3: Update bank details with Razorpay IDs
      bankDetails.razorpayContactId = contact.id;
      bankDetails.razorpayFundAccountId = fundAccount.id;
      bankDetails.razorpayStatus = 'active';
      bankDetails.isVerified = true;
      bankDetails.verifiedAt = new Date();
      bankDetails.payoutEnabled = true;
      bankDetails.defaultPayoutMode = 'bank';

      await bankDetails.save();

      res.json({
        success: true,
        message: '✅ Automatic payouts enabled! You will get paid instantly after each sale.',
        data: {
          razorpayStatus: 'active',
          payoutMode: 'bank',
          accountHolderName: bankDetails.accountHolderName,
          bankName: bankDetails.bankName,
          lastDigits: bankDetails.accountNumber.slice(-4),
        },
      });

    } catch (razorpayError) {
      console.error('❌ Razorpay setup error:', razorpayError);
      
      bankDetails.razorpayStatus = 'failed';
      bankDetails.verificationFailedReason = razorpayError.message;
      await bankDetails.save();

      return res.status(400).json({
        success: false,
        message: 'Failed to setup automatic payouts',
        error: razorpayError.message,
      });
    }

  } catch (error) {
    console.error('Setup payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting up automatic payouts',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/user/bank-details/setup-upi
 * @desc    Setup UPI for automatic payouts
 * @access  Private (Any user)
 */
const setupUPIPayouts = async (req, res) => {
  try {
    const { upiId } = req.body;
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!upiId) {
      return res.status(400).json({
        success: false,
        message: 'UPI ID is required',
      });
    }

    // Get existing bank details
    let bankDetails = await BankDetails.findOne({ userId });

    if (!bankDetails) {
      // Create minimal bank details for UPI only
      bankDetails = new BankDetails({
        userId,
        accountHolderName: user.name,
        accountNumber: 'UPI_ONLY',
        ifscCode: 'UPI0000000',
        bankName: 'UPI Payment',
        branch: 'Online',
        upiId: upiId,
      });
    } else {
      bankDetails.upiId = upiId;
    }

    try {
      console.log(`🚀 Setting up UPI payouts for user: ${user.email}`);

      // Create contact in Razorpay
      const contact = await razorpayService.createContact(
        bankDetails.accountHolderName || user.name,
        user.email,
        user.phone || '9999999999',
        'vendor'
      );

      console.log(`✅ Razorpay contact created: ${contact.id}`);

      // Create fund account for UPI
      const fundAccount = await razorpayService.createFundAccount(
        contact.id,
        'vpa',
        {
          vpa: {
            address: upiId,
          },
        }
      );

      console.log(`✅ Razorpay UPI fund account created: ${fundAccount.id}`);

      // Update bank details
      bankDetails.razorpayContactId = contact.id;
      bankDetails.razorpayFundAccountId = fundAccount.id;
      bankDetails.razorpayStatus = 'active';
      bankDetails.isVerified = true;
      bankDetails.verifiedAt = new Date();
      bankDetails.payoutEnabled = true;
      bankDetails.defaultPayoutMode = 'upi';

      await bankDetails.save();

      res.json({
        success: true,
        message: '✅ UPI automatic payouts enabled! You will get paid instantly after each sale.',
        data: {
          razorpayStatus: 'active',
          payoutMode: 'upi',
          upiId: bankDetails.upiId,
        },
      });

    } catch (razorpayError) {
      console.error('❌ Razorpay UPI setup error:', razorpayError);
      
      bankDetails.razorpayStatus = 'failed';
      bankDetails.verificationFailedReason = razorpayError.message;
      await bankDetails.save();

      return res.status(400).json({
        success: false,
        message: 'Failed to setup UPI payouts',
        error: razorpayError.message,
      });
    }

  } catch (error) {
    console.error('Setup UPI payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting up UPI payouts',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/user/bank-details/payout-status
 * @desc    Check if automatic payouts are enabled
 * @access  Private
 */
const getPayoutSetupStatus = async (req, res) => {
  try {
    const bankDetails = await BankDetails.findOne({ userId: req.userId });

    if (!bankDetails) {
      return res.json({
        success: true,
        data: {
          isSetup: false,
          hasBankDetails: false,
          message: 'Add bank details to start selling websites',
        },
      });
    }

    res.json({
      success: true,
      data: {
        isSetup: bankDetails.razorpayStatus === 'active',
        hasBankDetails: true,
        razorpayStatus: bankDetails.razorpayStatus,
        payoutEnabled: bankDetails.payoutEnabled,
        payoutMode: bankDetails.defaultPayoutMode,
        isVerified: bankDetails.isVerified,
        verifiedAt: bankDetails.verifiedAt,
        failureReason: bankDetails.verificationFailedReason,
        message: bankDetails.razorpayStatus === 'active' 
          ? '✅ You can sell websites and get paid automatically!' 
          : 'Setup automatic payouts to start selling',
      },
    });
  } catch (error) {
    console.error('Get payout status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout status',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/user/bank-details/toggle-payouts
 * @desc    Enable/disable automatic payouts
 * @access  Private
 */
const togglePayouts = async (req, res) => {
  try {
    const { enabled } = req.body;
    const bankDetails = await BankDetails.findOne({ userId: req.userId });

    if (!bankDetails) {
      return res.status(404).json({
        success: false,
        message: 'Bank details not found',
      });
    }

    bankDetails.payoutEnabled = enabled;
    await bankDetails.save();

    res.json({
      success: true,
      message: enabled ? '✅ Automatic payouts enabled' : '⏸️ Automatic payouts disabled',
    });
  } catch (error) {
    console.error('Toggle payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling payouts',
      error: error.message,
    });
  }
};

module.exports = {
  setupRazorpayPayouts,
  setupUPIPayouts,
  getPayoutSetupStatus,
  togglePayouts,
};