const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  day: { type: String, required: true }, // YYYY-MM-DD, in the browser's local timezone
  activityType: { type: String, enum: ['buying', 'selling'], required: true },
  seconds: { type: Number, default: 0, min: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });
activitySchema.index({ userId: 1, day: 1, activityType: 1 }, { unique: true });
module.exports = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
