const mongoose = require('mongoose');

/**
 * Connects ai-service to the same MongoDB the main backend uses, purely for
 * persisting the Gemini API key pool (config + live health/usage stats).
 * The in-memory job queue (jobs.service.js) is unaffected either way.
 *
 * Deliberately non-fatal: if MONGODB_URI isn't set (or the connection
 * fails), ai-service still boots and generateApp() falls back to a single
 * env-var key (GEMINI_API_KEY / GEMINI_API_KEYS) — see geminiPool.service.js
 * bootstrapFromEnv(). This preserves the "existing installs keep working"
 * requirement without forcing every ai-service deployment onto Mongo.
 */
async function connectPoolDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('ai-service: MONGODB_URI not set — Gemini pool will run from env vars only (no persistence).');
    return null;
  }

  try {
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log(`ai-service: MongoDB connected (${conn.connection.host}) — Gemini pool persistence enabled.`);
    return conn;
  } catch (error) {
    console.error('ai-service: MongoDB connection failed, continuing with env-var Gemini key only:', error.message);
    return null;
  }
}

module.exports = { connectPoolDB };
