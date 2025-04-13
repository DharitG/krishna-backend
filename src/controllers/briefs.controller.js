// Controller for handling brief-related API requests

const briefsService = require('../services/briefs.service');

const generateManualBrief = async (req, res) => {
  const userId = req.user.id; // Assuming user ID is attached by auth middleware
  const { type } = req.body; // Optional: allow specifying brief type

  try {
    const brief = await briefsService.createAndStoreBrief(userId, type || 'manual');
    res.status(201).json(brief);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate brief', error: error.message });
  }
};

const getBriefHistory = async (req, res) => {
  const userId = req.user.id;

  try {
    const history = await briefsService.getBriefHistory(userId);
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve brief history', error: error.message });
  }
};

module.exports = {
  generateManualBrief,
  getBriefHistory,
};
