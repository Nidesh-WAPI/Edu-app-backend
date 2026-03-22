const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { loginAdmin } = require('../services/auth.service');

const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json(new ApiResponse(400, 'Email and password are required'));
  }

  const result = await loginAdmin(email, password);

  res.status(200).json(new ApiResponse(200, 'Login successful', result));
});

const logout = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, 'Logged out successfully'));
});

module.exports = { adminLogin, logout };
