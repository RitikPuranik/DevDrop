const mongoose = require('mongoose');

/**
 * Connects ai-service to its OWN dedicated MongoDB deployment/cluster,
 * used exclusively to persist the Gemini API key pool (config + live
 * health/usage stats). This is a deliberately separate database from the
 * main backend's — ai-service is the sole owner of Gemini credentials and
 * the backend never connects to this deployment or queries this
 * collection directly; every read/write goes through ai-service's HTTP
 * API (see routes.js) instead.
 *
 * The in-memory job queue (jobs.service.js) is unaffected either way.
 *
 * Deliberately non-fatal: if GEMINI_MONGODB_URI isn't set (or the
 * connection fails), ai-service still boots and generateApp() falls back
 * to a single env-var key (GEMINI_API_KEY / GEMINI_API_KEYS) — see
 * geminiPool.service.js bootstrapFromEnv(). This preserves the "existing
 * installs keep working" requirement without forcing every ai-service
 * deployment onto Mongo.
 */
async function connectPoolDB() {
  const uri = process.env.GEMINI_MONGODB_URI;
  if (!uri) {
    console.warn('ai-service: GEMINI_MONGODB_URI not set — Gemini pool will run from env vars only (no persistence).');
    return null;
  }

  try {
    const conn = await mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log(`ai-service: MongoDB connected — Gemini pool persistence enabled (dedicated deployment).`);
    return conn;
  } catch (error) {
    console.error('ai-service: MongoDB connection failed, continuing with env-var Gemini key only:', error.message);
    return null;
  }
}

module.exports = { connectPoolDB };
  