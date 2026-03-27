const analyticsService = require('../../services/analytics.service');

const getPlatformStats = async (req, res) => {
  try {
    const stats = await analyticsService.getPlatformStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching platform stats', error: error.message });
  }
};

const getWebsiteStats = async (req, res) => {
  try {
    const stats = await analyticsService.getWebsiteStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching website stats', error: error.message });
  }
};

const getSalesStats = async (req, res) => {
  try {
    const { period = 30 } = req.query;
    const stats = await analyticsService.getSalesStats(parseInt(period));
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching sales stats', error: error.message });
  }
};

const getAllUser =async (req, res) => {
  try {
    const datas = await analyticsService.getAllUser();
    res.json({ success: true, data:datas})
  }
  catch(error){
    res.status(500).json({success: false, message: 'andi mandi sandi priyal pagalu ',  error: error.message})
  }
}

module.exports = { getPlatformStats, getWebsiteStats, getSalesStats, getAllUser };
