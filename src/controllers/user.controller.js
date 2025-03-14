const { supabase } = require('../services/supabase');

/**
 * Get user profile
 */
exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user profile from the database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
      return res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
    
    if (!profile) {
      // Create a new profile if one doesn't exist
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{
          id: userId,
          email: req.user.email,
          full_name: req.user.user_metadata?.full_name || '',
          avatar_url: req.user.user_metadata?.avatar_url || '',
          preferences: {
            theme: 'dark',
            useTools: true,
            enabledTools: []
          },
          last_login: new Date()
        }])
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating profile:', createError);
        return res.status(500).json({ message: 'Error creating profile', error: createError.message });
      }
      
      return res.json(newProfile);
    }
    
    // Update last login
    await supabase
      .from('profiles')
      .update({ last_login: new Date() })
      .eq('id', userId);
    
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { full_name, avatar_url } = req.body;
    
    // Update profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        full_name: full_name,
        avatar_url: avatar_url,
        updated_at: new Date()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
    
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

/**
 * Get authentication status for all connected services
 */
exports.getAuthStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get service tokens
    const { data: serviceTokens, error } = await supabase
      .from('service_tokens')
      .select('service_name, expires_at')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching service tokens:', error);
      return res.status(500).json({ message: 'Error fetching service tokens', error: error.message });
    }
    
    // Check which services are authenticated
    const authStatus = {};
    const now = new Date();
    
    if (serviceTokens) {
      serviceTokens.forEach(token => {
        const isValid = token.expires_at ? new Date(token.expires_at) > now : false;
        authStatus[token.service_name] = isValid;
      });
    }
    
    res.json(authStatus);
  } catch (error) {
    next(error);
  }
};