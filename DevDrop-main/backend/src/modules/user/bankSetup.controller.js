const BankDetails = require('./bankDetails.model');
const User = require('./user.model');

/**
 * @route  POST /api/user/bank-details/setup-payouts
 * @desc   Verify and activate bank payout mode for a seller
 *         (No external API call needed — admin processes payouts manually)
 * @access Private
 */
const setupBankPayouts = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const bankDetails = await BankDetails.findOne({ userId: req.userId });
    if (!bankDetails) return res.status(400).json({ success: false, message: 'Please save your bank details first' });

    bankDetails.isVerified = true;
    bankDetails.verifiedAt = new Date();
    bankDetails.payoutEnabled = true;
    bankDetails.defaultPayoutMode = 'bank';
    bankDetails.verificationFailedReason = undefined;
    await bankDetails.save();

    res.json({
      success: true,
      message: 'Bank payouts activated! The admin will transfer your earnings directly to your bank account.',
      data: {
        payoutMode: 'bank',
        bankName: bankDetails.bankName,
        lastDigits: bankDetails.accountNumber.slice(-4),
        isVerified: true,
      },
    });
  } catch (error) {
    console.error('Setup bank payouts error:', error);
    res.status(500).json({ success: false, message: 'Error setting up payouts', error: error.message });
  }
};

/**
 * @route  POST /api/user/bank-details/setup-upi
 * @desc   Save UPI ID and activate UPI payout mode
 * @access Private
 */
const setupUPIPayouts = async (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ success: false, message: 'UPI ID is required' });

    const user = await User.findById(req.userId);
    let bankDetails = await BankDetails.findOne({ userId: req.userId });

    if (!bankDetails) {
      bankDetails = new BankDetails({
        userId:            req.userId,
        accountHolderName: user.name,
        accountNumber:     'UPI_ONLY',
        ifscCode:          'UPIO0000000',
        bankName:          'UPI Payment',
        branch:            'Online',
        upiId,
      });
    } else {
      bankDetails.upiId = upiId;
    }

    bankDetails.isVerified = true;
    bankDetails.verifiedAt = new Date();
    bankDetails.payoutEnabled = true;
    bankDetails.defaultPayoutMode = 'upi';
    await bankDetails.save();

    res.json({
      success: true,
      message: 'UPI payouts activated! The admin will send your earnings to your UPI ID.',
      data: {
        payoutMode: 'upi',
        upiId,
        isVerified: true,
      },
    });
  } catch (error) {
    console.error('Setup UPI payouts error:', error);
    res.status(500).json({ success: false, message: 'Error setting up UPI payouts', error: error.message });
  }
};

/**
 * @route  GET /api/user/bank-details/payout-status
 * @desc   Get current payout setup status
 * @access Private
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
          message: 'Add bank details to start selling',
        },
      });
    }

    res.json({
      success: true,
      data: {
        isSetup:        bankDetails.isVerified && bankDetails.payoutEnabled,
        hasBankDetails: true,
        payoutEnabled:  bankDetails.payoutEnabled,
        payoutMode:     bankDetails.defaultPayoutMode,
        isVerified:     bankDetails.isVerified,
        verifiedAt:     bankDetails.verifiedAt,
        failureReason:  bankDetails.verificationFailedReason,
        message: bankDetails.isVerified && bankDetails.payoutEnabled
          ? 'You can sell websites! Admin will process your payouts manually.'
          : 'Setup payouts to start selling',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching payout status', error: error.message });
  }
};

/**
 * @route  POST /api/user/bank-details/toggle-payouts
 * @desc   Enable or disable payouts
 * @access Private
 */
const togglePayouts = async (req, res) => {
  try {
    const { enabled } = req.body;
    const bankDetails = await BankDetails.findOne({ userId: req.userId });
    if (!bankDetails) return res.status(404).json({ success: false, message: 'Bank details not found' });

    bankDetails.payoutEnabled = enabled;
    await bankDetails.save();
    res.json({ success: true, message: enabled ? 'Payouts enabled' : 'Payouts disabled' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error toggling payouts', error: error.message });
  }
};

module.exports = { setupBankPayouts, setupUPIPayouts, getPayoutSetupStatus, togglePayouts };
