const { supabase } = require('../services/supabase');

/**
 * Get user preferences
 */
exports.getPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user preferences
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching preferences:', error);
      return res.status(500).json({ message: 'Error fetching preferences', error: error.message });
    }
    
    // Return empty object if no preferences are set
    const preferences = profile?.preferences || {};
    
    res.json(preferences);
  } catch (error) {
    next(error);
  }
};

/**
 * Update user preferences
 */
exports.updatePreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const newPreferences = req.body;
    
    // Get current preferences
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching preferences:', fetchError);
      return res.status(500).json({ message: 'Error fetching preferences', error: fetchError.message });
    }
    
    // Merge existing preferences with new ones
    const currentPreferences = profile?.preferences || {};
    const updatedPreferences = {
      ...currentPreferences,
      ...newPreferences
    };
    
    // Update preferences
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        preferences: updatedPreferences,
        updated_at: new Date()
      })
      .eq('id', userId)
      .select('preferences')
      .single();
    
    if (updateError) {
      console.error('Error updating preferences:', updateError);
      return res.status(500).json({ message: 'Error updating preferences', error: updateError.message });
    }
    
    res.json(updatedProfile.preferences);
  } catch (error) {
    next(error);
  }
};