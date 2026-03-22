/**
 * Seed Script — Create initial Super Admin
 * Usage:  node src/scripts/seed.admin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin.model');

const ADMIN = {
  name: 'Super Admin',
  email: 'admin@eduapp.com',
  password: 'Admin@1234',
  isSuperAdmin: true,
  isActive: true,
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    const existing = await Admin.findOne({ email: ADMIN.email });
    if (existing) {
      console.log(`Admin already exists: ${ADMIN.email}`);
      process.exit(0);
    }

    await Admin.create(ADMIN);
    console.log('✅ Super Admin created successfully!');
    console.log(`   Email   : ${ADMIN.email}`);
    console.log(`   Password: ${ADMIN.password}`);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
