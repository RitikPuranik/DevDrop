const crypto = require('crypto');
const poolClient = require('./geminiPoolServiceClient');
const { encrypt } = require('./geminiCrypto');
const { getModel } = require('./geminiApiKey.model');

function maskKey(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return `${obj.keyPrefix || 'AIza'}...${obj.keySuffix || '????'}`;
}

function serializeKey(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    label: obj.label,
    maskedKey: maskKey(obj),
    enabled: obj.enabled,
    priority: obj.priority,
    status: obj.status,
    cooldownUntil: obj.cooldownUntil,
    isCoolingDown: Boolean(obj.cooldownUntil && new Date(obj.cooldownUntil).getTime() > Date.now()),
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
    // Token usage tracking
    totalTokensUsed: obj.totalTokensUsed || 0,
    promptTokensUsed: obj.promptTokensUsed || 0,
    candidateTokensUsed: obj.candidateTokensUsed || 0,
    dailyTokensUsed: obj.dailyTokensUsed || 0,
    lastTokenResetAt: obj.lastTokenResetAt || null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function respondWithClientError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error.message);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.userMessage || fallbackMessage,
  });
}

async function notifyPoolReload() {
  try {
    await poolClient.reloadPool();
  } catch (error) {
    console.warn('Gemini pool reload notification failed:', error.message);
  }
}

exports.listKeys = async (req, res) => {
  try {
    const Model = await getModel();
    const rawPage = Number.parseInt(req.query.page || '1', 10);
    const rawLimit = Number.parseInt(req.query.limit || '20', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all').trim();

    const query = {};
    if (search) {
      const escaped = search.replace(/[.*+?^()|[\]\\]/g, '\\exports.listKeys = async (req, res) => {
  try {
    const Model = await getModel();
    const keys = await Model.find().sort({ priority: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: { keys: keys.map(serializeKey) } });
  } catch (error) {');
      query.$or = [
        { label: { $regex: escaped, $options: 'i' } },
        { keySuffix: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (status === 'disabled') {
      query.enabled = false;
    } else if (['healthy', 'busy', 'rate_limited', 'degraded', 'invalid'].includes(status)) {
      query.enabled = true;
      query.status = status;
    } else if (status === 'out_of_tokens') {
      query.enabled = true;
      query.dailyTokensUsed = {
        $gte: Number.parseInt(process.env.GEMINI_DAILY_TOKEN_LIMIT || '1500000', 10),
      };
    }

    const [keys, total] = await Promise.all([
      Model.find(query).sort({ priority: 1, createdAt: 1 }).skip((page - 1) * limit).limit(limit),
      Model.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: { keys: keys.map(serializeKey) },
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    respondWithClientError(res, error, 'Failed to load Gemini API keys.');
  }
};

exports.addKey = async (req, res) => {
  try {
    const { label, apiKey, priority, enabled } = req.body || {};
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ success: false, message: 'A label is required.' });
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'A valid Gemini API key is required.' });
    }

    const Model = await getModel();
    const rawKey = apiKey.trim();
    const keyFingerprint = crypto.createHash('sha256').update(rawKey).digest('hex');
    const existing = await Model.findOne({ keyFingerprint });
    if (existing) {
      return res.status(409).json({ success: false, message: 'This Gemini API key is already configured.' });
    }

    const doc = await Model.create({
      label: label.trim(),
      encryptedKey: encrypt(rawKey),
      keyFingerprint,
      keyPrefix: rawKey.slice(0, 4) || 'AIza',
      keySuffix: rawKey.slice(-4),
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      priority: priority !== undefined ? Number(priority) : 100,
      status: enabled === false ? 'disabled' : 'healthy',
    });

    await notifyPoolReload();
    res.status(201).json({ success: true, data: { key: serializeKey(doc) } });
  } catch (error) {
    respondWithClientError(res, error, 'Failed to add the Gemini API key.');
  }
};

exports.testKey = async (req, res) => {
  try {
    const result = await poolClient.testKey(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    respondWithClientError(res, error, 'Failed to test the Gemini API key.');
  }
};

exports.updateKey = async (req, res) => {
  try {
    const { label, enabled, priority, apiKey } = req.body || {};
    const Model = await getModel();
    const doc = await Model.findById(req.params.id).select('+encryptedKey');
    if (!doc) return res.status(404).json({ success: false, message: 'Gemini key not found.' });

    const update = {};
    if (label !== undefined) {
      if (!String(label).trim()) return res.status(400).json({ success: false, message: 'Label cannot be empty.' });
      update.label = String(label).trim();
    }
    if (enabled !== undefined) update.enabled = Boolean(enabled);
    if (priority !== undefined) {
      if (!Number.isFinite(Number(priority))) return res.status(400).json({ success: false, message: 'Priority must be a number.' });
      update.priority = Number(priority);
    }

    if (apiKey !== undefined) {
      if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        return res.status(400).json({ success: false, message: 'A valid Gemini API key is required.' });
      }
      const rawKey = apiKey.trim();
      const keyFingerprint = crypto.createHash('sha256').update(rawKey).digest('hex');
      const duplicate = await Model.findOne({ keyFingerprint, _id: { $ne: doc._id } });
      if (duplicate) return res.status(409).json({ success: false, message: 'This Gemini API key is already configured.' });
      update.encryptedKey = encrypt(rawKey);
      update.keyFingerprint = keyFingerprint;
      update.keyPrefix = rawKey.slice(0, 4) || 'AIza';
      update.keySuffix = rawKey.slice(-4);
      update.failureCount = 0;
      update.consecutiveFailures = 0;
      update.cooldownUntil = null;
      update.lastErrorCode = null;
      update.lastErrorMessage = null;
      update.status = enabled === false ? 'disabled' : 'healthy';
    }

    if (enabled !== undefined && apiKey === undefined) {
      update.status = enabled ? (doc.status === 'disabled' ? 'healthy' : doc.status) : 'disabled';
    }

    const updated = await Model.findByIdAndUpdate(doc._id, update, { new: true });
    await notifyPoolReload();
    res.status(200).json({ success: true, data: { key: serializeKey(updated) } });
  } catch (error) {
    respondWithClientError(res, error, 'Failed to update the Gemini API key.');
  }
};

exports.deleteKey = async (req, res) => {
  try {
    const Model = await getModel();
    const deleted = await Model.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Gemini key not found.' });
    await notifyPoolReload();
    res.status(200).json({ success: true, message: 'Gemini API key removed.' });
  } catch (error) {
    respondWithClientError(res, error, 'Failed to delete the Gemini API key.');
  }
};

exports.reorderKeys = async (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedIds must be a non-empty array.' });
    }
    const Model = await getModel();
    await Promise.all(
      orderedIds.map((id, index) => Model.findByIdAndUpdate(id, { priority: (index + 1) * 10 }))
    );
    await notifyPoolReload();
    const keys = await Model.find().sort({ priority: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: { keys: keys.map(serializeKey) } });
  } catch (error) {
    respondWithClientError(res, error, 'Failed to reorder Gemini API keys.');
  }
};

exports.getPoolStatus = async (req, res) => {
  try {
    const live = await poolClient.getLiveStatus();
    if (!live) {
      return res.status(200).json({
        success: true,
        data: {
          totalKeys: null,
          enabledKeys: null,
          disabledKeys: null,
          healthyKeys: null,
          rateLimitedKeys: null,
          invalidKeys: null,
          activeRequests: null,
          queuedRequests: null,
          globalConcurrency: Number(process.env.AI_CONCURRENCY) || null,
          perKeyConcurrency: Number(process.env.GEMINI_PER_KEY_CONCURRENCY) || null,
          aiServiceReachable: false,
          keys: [],
        },
      });
    }
    const rawPage = Number.parseInt(req.query.page || '1', 10);
    const rawLimit = Number.parseInt(req.query.limit || '20', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || 'all').trim();
    const allLiveKeys = Array.isArray(live.keys) ? live.keys : [];

    const filteredLiveKeys = allLiveKeys.filter((key) => {
      if (search) {
        const label = String(key.label || '').toLowerCase();
        const maskedKey = String(key.maskedKey || key.keySuffix || '').toLowerCase();
        if (!label.includes(search) && !maskedKey.includes(search)) return false;
      }
      if (status === 'disabled') return !key.enabled;
      if (status === 'out_of_tokens') return Boolean(key.isOutOfTokens);
      if (['healthy', 'busy', 'rate_limited', 'degraded', 'invalid'].includes(status)) {
        const effectiveStatus = !key.enabled ? 'disabled' : (key.status || 'healthy');
        return effectiveStatus === status;
      }
      return true;
    });

    const start = (page - 1) * limit;
    const totalLiveKeys = filteredLiveKeys.length;
    const liveKeys = filteredLiveKeys.slice(start, start + limit);
    const totalPages = Math.ceil(totalLiveKeys / limit);

    res.status(200).json({
      success: true,
      data: {
        ...live,
        keys: liveKeys,
        keysPagination: {
          page,
          limit,
          total: totalLiveKeys,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Gemini pool status error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load Gemini pool status.' });
  }
};
