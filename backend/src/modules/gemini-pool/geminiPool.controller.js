const GeminiApiKey = require('./geminiApiKey.model');
const { encrypt } = require('../../shared/utils/crypto');
const poolClient = require('./geminiPoolServiceClient');

/**
 * Admin-only management of the Gemini API key pool that powers AI Studio.
 * This controller owns persisted config in Mongo (create/list/update/
 * delete/reorder + encryption); the actual Gemini calls, key selection,
 * and live cooldown/health tracking happen in ai-service
 * (ai-service/src/geminiPool.service.js), which reads this same collection.
 */

function maskKey(doc) {
  const prefix = doc.keyPrefix || 'AIza';
  const suffix = doc.keySuffix || '????';
  return `${prefix}...${suffix}`;
}

function isCoolingDown(doc) {
  return Boolean(doc.cooldownUntil && new Date(doc.cooldownUntil).getTime() > Date.now());
}

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    label: obj.label,
    maskedKey: maskKey(obj),
    enabled: obj.enabled,
    priority: obj.priority,
    status: obj.status,
    cooldownUntil: obj.cooldownUntil,
    isCoolingDown: isCoolingDown(obj),
    failureCount: obj.failureCount,
    consecutiveFailures: obj.consecutiveFailures,
    totalRequests: obj.totalRequests,
    totalSuccesses: obj.totalSuccesses,
    totalFailures: obj.totalFailures,
    lastUsedAt: obj.lastUsedAt,
    lastSuccessAt: obj.lastSuccessAt,
    lastFailureAt: obj.lastFailureAt,
    lastErrorCode: obj.lastErrorCode,
    lastErrorMessage: obj.lastErrorMessage,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

// A raw Gemini key never appears in a thrown error, a log line, or a
// response body anywhere in this controller — only `encrypt()`'s ciphertext
// output and the 4-char suffix used for masking are ever persisted/returned.

// GET /api/admin/gemini-keys
exports.listKeys = async (req, res) => {
  try {
    const keys = await GeminiApiKey.find().sort({ priority: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: { keys: keys.map(serialize) } });
  } catch (error) {
    console.error('List Gemini keys error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load Gemini API keys.' });
  }
};

// POST /api/admin/gemini-keys  { label, apiKey, priority?, enabled? }
exports.addKey = async (req, res) => {
  try {
    const { label, apiKey, priority, enabled } = req.body || {};

    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'A label is required.' });
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'A valid Gemini API key is required.' });
    }

    const trimmedKey = apiKey.trim();
    const doc = await GeminiApiKey.create({
      label: label.trim(),
      encryptedKey: encrypt(trimmedKey),
      keySuffix: trimmedKey.slice(-4),
      keyPrefix: trimmedKey.slice(0, 4) || 'AIza',
      enabled: enabled === undefined ? true : Boolean(enabled),
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 100,
      status: 'healthy',
    });

    await poolClient.reloadPool();

    res.status(201).json({ success: true, data: { key: serialize(doc) } });
  } catch (error) {
    console.error('Add Gemini key error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add the Gemini API key.' });
  }
};

// POST /api/admin/gemini-keys/:id/test
exports.testKey = async (req, res) => {
  try {
    const doc = await GeminiApiKey.findById(req.params.id).select('+encryptedKey');
    if (!doc) return res.status(404).json({ success: false, message: 'Gemini key not found.' });

    const result = await poolClient.testKey({ id: String(doc._id), encryptedKey: doc.encryptedKey });

    // Reflect the test outcome immediately so the admin UI doesn't have to
    // wait for a real generation request to update status.
    const update = {
      lastErrorCode: result?.errorCode || null,
      lastErrorMessage: result?.valid ? null : result?.message || null,
    };
    if (result?.valid) {
      update.status = 'healthy';
      update.cooldownUntil = null;
      update.consecutiveFailures = 0;
    } else if (result?.classification === 'invalid') {
      update.status = 'invalid';
    } else if (result?.classification === 'rate_limit') {
      update.status = 'rate_limited';
    } else if (result?.classification) {
      update.status = 'degraded';
    }
    await GeminiApiKey.findByIdAndUpdate(doc._id, update);

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Test Gemini key error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.userMessage || 'Failed to test the Gemini API key.',
    });
  }
};

// PATCH /api/admin/gemini-keys/:id  { label?, enabled?, priority?, apiKey? }
exports.updateKey = async (req, res) => {
  try {
    const { label, enabled, priority, apiKey } = req.body || {};
    const update = {};

    if (label !== undefined) {
      if (!String(label).trim()) {
        return res.status(400).json({ success: false, message: 'Label cannot be empty.' });
      }
      update.label = String(label).trim();
    }
    if (enabled !== undefined) update.enabled = Boolean(enabled);
    if (priority !== undefined) {
      const p = Number(priority);
      if (!Number.isFinite(p)) return res.status(400).json({ success: false, message: 'Priority must be a number.' });
      update.priority = p;
    }
    if (apiKey !== undefined) {
      if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        return res.status(400).json({ success: false, message: 'A valid Gemini API key is required.' });
      }
      const trimmedKey = apiKey.trim();
      update.encryptedKey = encrypt(trimmedKey);
      update.keySuffix = trimmedKey.slice(-4);
      update.keyPrefix = trimmedKey.slice(0, 4) || 'AIza';
      // Rotating the key is a fresh start for health tracking.
      update.status = 'healthy';
      update.cooldownUntil = null;
      update.consecutiveFailures = 0;
      update.lastErrorCode = null;
      update.lastErrorMessage = null;
    }
    // Re-enabling a previously invalid/degraded key gives it a clean slate
    // rather than leaving it permanently blacklisted — per spec, invalid
    // keys require manual admin action to come back, and this is that
    // action.
    if (enabled === true) {
      update.consecutiveFailures = 0;
      update.cooldownUntil = null;
      if (update.status === undefined) update.status = 'healthy';
    }

    const doc = await GeminiApiKey.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Gemini key not found.' });

    await poolClient.reloadPool();

    res.status(200).json({ success: true, data: { key: serialize(doc) } });
  } catch (error) {
    console.error('Update Gemini key error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update the Gemini API key.' });
  }
};

// DELETE /api/admin/gemini-keys/:id
// Removing a key here only removes it from future selection — ai-service
// already holds a decrypted copy in memory for any request in flight on
// this key, so an active generation finishes normally.
exports.deleteKey = async (req, res) => {
  try {
    const doc = await GeminiApiKey.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Gemini key not found.' });

    await poolClient.reloadPool();

    res.status(200).json({ success: true, message: 'Gemini API key removed.' });
  } catch (error) {
    console.error('Delete Gemini key error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete the Gemini API key.' });
  }
};

// POST /api/admin/gemini-keys/reorder  { orderedIds: [id, id, ...] }
exports.reorderKeys = async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedIds must be a non-empty array.' });
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        GeminiApiKey.findByIdAndUpdate(id, { priority: (index + 1) * 10 })
      )
    );

    await poolClient.reloadPool();

    const keys = await GeminiApiKey.find().sort({ priority: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: { keys: keys.map(serialize) } });
  } catch (error) {
    console.error('Reorder Gemini keys error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reorder Gemini API keys.' });
  }
};

// GET /api/admin/gemini-pool/status
exports.getPoolStatus = async (req, res) => {
  try {
    const keys = await GeminiApiKey.find();
    const enabledKeys = keys.filter((k) => k.enabled);
    const counts = {
      totalKeys: keys.length,
      enabledKeys: enabledKeys.length,
      disabledKeys: keys.length - enabledKeys.length,
      healthyKeys: keys.filter((k) => k.enabled && k.status === 'healthy' && !isCoolingDown(k)).length,
      rateLimitedKeys: keys.filter((k) => k.status === 'rate_limited' || (k.enabled && isCoolingDown(k))).length,
      invalidKeys: keys.filter((k) => k.status === 'invalid').length,
    };

    const live = await poolClient.getLiveStatus();

    res.status(200).json({
      success: true,
      data: {
        ...counts,
        activeRequests: live?.activeRequests ?? null,
        queuedRequests: live?.queuedRequests ?? null,
        globalConcurrency: live?.globalConcurrency ?? (Number(process.env.AI_CONCURRENCY) || null),
        perKeyConcurrency: live?.perKeyConcurrency ?? (Number(process.env.GEMINI_PER_KEY_CONCURRENCY) || null),
        aiServiceReachable: Boolean(live),
        keys: keys.sort((a, b) => a.priority - b.priority).map(serialize),
      },
    });
  } catch (error) {
    console.error('Gemini pool status error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load Gemini pool status.' });
  }
};
