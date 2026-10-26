const Activity = require('./activity.model');

const validType = (value) => value === 'buying' || value === 'selling';

exports.heartbeat = async (req, res) => {
  try {
    const { activityType, day, seconds } = req.body || {};
    if (!validType(activityType) || typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ success: false, message: 'Valid activityType and day are required.' });
    }
    // Avoid inflated numbers if a client sends an accidental or malicious value.
    const safeSeconds = Math.max(0, Math.min(90, Math.floor(Number(seconds) || 0)));
    const item = await Activity.findOneAndUpdate(
      { userId: req.userId, day, activityType },
      { $inc: { seconds: safeSeconds }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, data: { seconds: item.seconds } });
  } catch (error) {
    if (error.code === 11000) return res.status(200).json({ success: true });
    return res.status(500).json({ success: false, message: 'Could not save activity.' });
  }
};

exports.getHeatmap = async (req, res) => {
  try {
    const days = Math.max(7, Math.min(365, Number.parseInt(req.query.days, 10) || 365));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const startDay = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
    const rows = await Activity.find({ userId: req.userId, day: { $gte: startDay } }).select('day activityType seconds -_id').lean();
    const byDay = new Map();
    for (const row of rows) {
      if (!byDay.has(row.day)) byDay.set(row.day, { date: row.day, buyingMinutes: 0, sellingMinutes: 0 });
      const item = byDay.get(row.day);
      item[row.activityType === 'buying' ? 'buyingMinutes' : 'sellingMinutes'] += Math.round((row.seconds || 0) / 60);
    }
    const data = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      data.push(byDay.get(key) || { date: key, buyingMinutes: 0, sellingMinutes: 0 });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not load activity heatmap.' });
  }
};
