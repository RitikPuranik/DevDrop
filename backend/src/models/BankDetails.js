const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // One bank detail per user
  },
  accountHolderName: {
    type: String,
    required: [true, 'Account holder name is required'],
    trim: true,
  },
  accountNumber: {
    type: String,
    required: [true, 'Account number is required'],
    trim: true,
  },
  ifscCode: {
    type: String,
    required: [true, 'IFSC code is required'],
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Please provide a valid IFSC code'],
  },
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true,
  },
  branch: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true,
  },
  upiId: {
    type: String,
    trim: true,
    match: [/^[\w.-]+@[\w.-]+$/, 'Please provide a valid UPI ID'],
  },
}, {
  timestamps: true,
});

// Index for faster user lookups
bankDetailsSchema.index({ userId: 1 });

module.exports = mongoose.model('BankDetails', bankDetailsSchema);