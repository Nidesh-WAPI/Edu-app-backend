const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { sendOtp, verifyOtp } = require('../services/customer.auth.service');

// POST /api/v1/customer/auth/send-otp
const sendOtpController = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) throw new ApiError(400, 'Phone number is required');

  // Basic phone validation (10 digits, allow optional country code)
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 10 || clean.length > 13) {
    throw new ApiError(400, 'Please enter a valid phone number');
  }

  const result = await sendOtp(clean);
  res.json(new ApiResponse(200, result.message, { expiresInMinutes: result.expiresInMinutes }));
});

// POST /api/v1/customer/auth/verify-otp
const verifyOtpController = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) throw new ApiError(400, 'Phone number and OTP are required');

  const clean = phone.replace(/\D/g, '');
  const result = await verifyOtp(clean, otp.trim());

  res.json(new ApiResponse(200, 'Login successful', result));
});

module.exports = { sendOtpController, verifyOtpController };
