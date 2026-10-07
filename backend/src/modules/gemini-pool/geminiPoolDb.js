const mongoose = require('mongoose');

let connection = null;
let connectPromise = null;

async function connectGeminiPoolDB() {
  const uri = process.env.GEMINI_MONGODB_URI;
  if (!uri) {
    throw new Error('GEMINI_MONGODB_URI is not configured.');
  }

  if (connection?.readyState === 1) return connection;
  if (connectPromise) return connectPromise;

  connectPromise = mongoose.createConnection(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
  }).asPromise().then((conn) => {
    connection = conn;
    conn.on('error', (error) => {
      console.error('Gemini MongoDB connection error:', error.message);
    });
    console.log(`✅ Gemini MongoDB connected: ${conn.host}/${conn.name}`);
    return conn;
  }).finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

async function getGeminiPoolDB() {
  return connectGeminiPoolDB();
}

async function closeGeminiPoolDB() {
  if (connection) {
    await connection.close();
    connection = null;
  }
}

module.exports = { connectGeminiPoolDB, getGeminiPoolDB, closeGeminiPoolDB };
