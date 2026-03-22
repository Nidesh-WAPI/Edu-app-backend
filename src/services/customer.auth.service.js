/**
 * Customer Auth Service — Mobile OTP authentication
 *
 * OTP is currently HARDCODED to 123456.
 * Replace the sendOtp logic with a real SMS provider (Twilio, MSG91, etc.) later.
 */

const Customer = require('../models/Customer.model');
const { generateAccessToken, generateRefreshToken } = require('./token.service');
const ApiError = require('../utils/ApiError');

const HARDCODED_OTP = '123456';
const OTP_EXPIRY_MINUTES = 10;

/**
 * Send OTP to a phone number.
 * Creates the customer if first-time login.
 */
const sendOtp = async (phone) => {
  let customer = await Customer.findOne({ phone });

  if (!customer) {
    customer = await Customer.create({ phone });
  }

  if (!customer.isActive) {
    throw new ApiError(403, 'Your account has been deactivated. Please contact support.');
  }

  const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // TODO: Replace with real SMS provider
  // await smsProvider.send(phone, `Your OTP is ${HARDCODED_OTP}`);

  await Customer.findByIdAndUpdate(customer._id, {
    otp: HARDCODED_OTP,
    otpExpiry,
  });

  console.log(`[OTP] Sent to ${phone}: ${HARDCODED_OTP} (hardcoded)`);

  return { message: 'OTP sent successfully', expiresInMinutes: OTP_EXPIRY_MINUTES };
};

/**
 * Verify OTP and return JWT tokens.
 */
const verifyOtp = async (phone, otp) => {
  const customer = await Customer.findOne({ phone }).select('+otp +otpExpiry');

  if (!customer) {
    throw new ApiError(404, 'Phone number not registered. Please request an OTP first.');
  }

  if (!customer.otp || customer.otp !== otp) {
    throw new ApiError(400, 'Invalid OTP. Please try again.');
  }

  if (customer.otpExpiry && new Date() > customer.otpExpiry) {
    throw new ApiError(400, 'OTP has expired. Please request a new one.');
  }

  // Clear OTP after successful verification
  await Customer.findByIdAndUpdate(customer._id, { otp: null, otpExpiry: null });

  const payload = { id: customer._id, phone: customer.phone, role: 'customer' };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    customer: { _id: customer._id, name: customer.name, phone: customer.phone },
  };
};

module.exports = { sendOtp, verifyOtp };
