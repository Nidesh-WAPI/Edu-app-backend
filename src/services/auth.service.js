const Admin = require('../models/Admin.model');
const { generateAccessToken, generateRefreshToken } = require('./token.service');
const ApiError = require('../utils/ApiError');

const loginAdmin = async (email, password) => {
  const admin = await Admin.findOne({ email }).select('+password');

  if (!admin || !(await admin.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!admin.isActive) {
    throw new ApiError(403, 'Account is deactivated. Contact support.');
  }

  const payload = { id: admin._id, email: admin.email, role: 'admin' };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const adminData = { _id: admin._id, name: admin.name, email: admin.email, isSuperAdmin: admin.isSuperAdmin };

  return { accessToken, refreshToken, admin: adminData };
};

module.exports = { loginAdmin };
