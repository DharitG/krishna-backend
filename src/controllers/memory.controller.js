const memoryService = require('../services/memory.service');
const { supabase } = require('../services/supabase');

/**
 * Get memories for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMemories = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const category = req.query.category;
    
    // Build query
    let query = supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false });
    
    // Add category filter if provided
    if (category) {
      query = query.eq('category', category);
    }
    
    // Add limit
    query = query.limit(limit);
    
    // Execute query
    const { data, error } = await query;
    
    if (error) {
      console.error('Error retrieving memories:', error);
      return res.status(500).json({ error: 'Failed to retrieve memories' });
    }
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error in getMemories controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete all memories for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteAllMemories = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { error } = await supabase
      .from('user_memories')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error deleting memories:', error);
      return res.status(500).json({ error: 'Failed to delete memories' });
    }
    
    return res.status(200).json({ message: 'All memories deleted successfully' });
  } catch (error) {
    console.error('Error in deleteAllMemories controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete a specific memory by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteMemory = async (req, res) => {
  try {
    const userId = req.user.id;
    const memoryId = req.params.id;
    
    const { error } = await supabase
      .from('user_memories')
      .delete()
      .eq('id', memoryId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error deleting memory:', error);
      return res.status(500).json({ error: 'Failed to delete memory' });
    }
    
    return res.status(200).json({ message: 'Memory deleted successfully' });
  } catch (error) {
    console.error('Error in deleteMemory controller:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getMemories,
  deleteAllMemories,
  deleteMemory
};
