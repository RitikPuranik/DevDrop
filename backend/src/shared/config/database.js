const mongoose = require('mongoose');

const connectDB = async () => {
  const candidates = [
    process.env.MONGODB_URI,
    'mongodb://127.0.0.1:27017/devdrop',
  ].filter(Boolean);

  try {
    let lastError;

    for (const uri of candidates) {
      try {
        const conn = await mongoose.connect(uri);
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
        return conn;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
