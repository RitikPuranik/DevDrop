const BankDetails = require('./bankDetails.model');
const User = require('./user.model');
const cashfreeService = require('../../services/cashfree.service');

const setupBankPayouts = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const bankDetails = await BankDetails.findOne({ userId: req.userId });
    if (!bankDetails) return res.status(400).json({ success: false, message: 'Please save your bank details first' });

    const beneficiaryId = `bene_${req.userId}`;

    // Check if already exists on Cashfree
    const existing = await cashfreeService.getBeneficiary(beneficiaryId);

    if (!existing) {
      await cashfreeService.addBeneficiary({
        beneficiaryId,
        name:        bankDetails.accountHolderName,
        email:       user.email,
        phone:       user.phone || '9999999999',
        bankAccount: bankDetails.accountNumber,
        ifsc:        bankDetails.ifscCode,
      });
    }

    bankDetails.cashfreeBeneficiaryId = beneficiaryId;
    bankDetails.cashfreeStatus = 'active';
    bankDetails.isVerified = true;
    bankDetails.verifiedAt = new Date();
    bankDetails.payoutEnabled = true;
    bankDetails.defaultPayoutMode = 'bank';
    await bankDetails.save();

    res.json({
      success: true,
      message: 'Automatic bank payouts enabled!',
      data: { cashfreeStatus: 'active', payoutMode: 'bank', bankName: bankDetails.bankName, lastDigits: bankDetails.accountNumber.slice(-4) },
    });
  } catch (error) {
    console.error('Setup bank payouts error:', error);
    res.status(500).json({ success: false, message: 'Error setting up payouts', error: error.message });
  }
};

const setupUPIPayouts = async (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ success: false, message: 'UPI ID is required' });

    const user = await User.findById(req.userId);
    let bankDetails = await BankDetails.findOne({ userId: req.userId });

    if (!bankDetails) {
      bankDetails = new BankDetails({
        userId: req.userId, accountHolderName: user.name,
        accountNumber: 'UPI_ONLY', ifscCode: 'UPIO0000000',
        bankName: 'UPI Payment', branch: 'Online', upiId,
      });
    } else {
      bankDetails.upiId = upiId;
    }

    const beneficiaryId = `bene_${req.userId}`;
    const existing = await cashfreeService.getBeneficiary(beneficiaryId);

    if (!existing) {
      await cashfreeService.addBeneficiary({
        beneficiaryId,
        name:  bankDetails.accountHolderName || user.name,
        email: user.email,
        phone: user.phone || '9999999999',
        upiId,
      });
    }

    bankDetails.cashfreeBeneficiaryId = beneficiaryId;
    bankDetails.cashfreeStatus = 'active';
    bankDetails.isVerified = true;
    bankDetails.verifiedAt = new Date();
    bankDetails.payoutEnabled = true;
    bankDetails.defaultPayoutMode = 'upi';
    await bankDetails.save();

    res.json({
      success: true,
      message: 'UPI payouts enabled!',
      data: { cashfreeStatus: 'active', payoutMode: 'upi', upiId },
    });
  } catch (error) {
    console.error('Setup UPI payouts error:', error);
    res.status(500).json({ success: false, message: 'Error setting up UPI payouts', error: error.message });
  }
};

const getPayoutSetupStatus = async (req, res) => {
  try {
    const bankDetails = await BankDetails.findOne({ userId: req.userId });
    if (!bankDetails) return res.json({ success: true, data: { isSetup: false, hasBankDetails: false, message: 'Add bank details to start selling' } });

    res.json({
      success: true,
      data: {
        isSetup:       bankDetails.cashfreeStatus === 'active',
        hasBankDetails: true,
        cashfreeStatus: bankDetails.cashfreeStatus,
        payoutEnabled:  bankDetails.payoutEnabled,
        payoutMode:     bankDetails.defaultPayoutMode,
        isVerified:     bankDetails.isVerified,
        verifiedAt:     bankDetails.verifiedAt,
        failureReason:  bankDetails.verificationFailedReason,
        message: bankDetails.cashfreeStatus === 'active'
          ? 'You can sell websites and get paid automatically!'
          : 'Setup payouts to start selling',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching payout status', error: error.message });
  }
};

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
