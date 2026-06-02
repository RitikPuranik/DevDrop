const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/devdrop';

  try {
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 10,          // Keep up to 10 connections open
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,                // Use IPv4 — avoids slow IPv6 fallback on some hosts
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
