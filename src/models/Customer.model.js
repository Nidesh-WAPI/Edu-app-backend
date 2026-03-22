const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
    // Stored OTP — will be replaced by real SMS provider later
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
