const { supabase } = require('../services/supabase');
const rateLimitService = require('../services/ratelimit.service');

/**
 * Get user's subscription status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's subscription from database
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
      throw error;
    }
    
    // Get rate limit info
    const rateLimitInfo = await rateLimitService.checkRateLimit(userId);
    
    // Return subscription status
    res.status(200).json({
      success: true,
      subscription: subscription || null,
      rateLimit: {
        plan: rateLimitInfo.plan,
        isAllowed: rateLimitInfo.isAllowed,
        limit: rateLimitInfo.limit === Infinity ? 'unlimited' : rateLimitInfo.limit,
        remaining: rateLimitInfo.remaining === Infinity ? 'unlimited' : rateLimitInfo.remaining
      }
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status',
      message: error.message
    });
  }
};

/**
 * Get user's purchase history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's purchase history from database
    const { data: purchases, error } = await supabase
      .from('purchase_history')
      .select('*')
      .eq('user_id', userId)
      .order('purchase_date', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    // Return purchase history
    res.status(200).json({
      success: true,
      purchases: purchases || []
    });
  } catch (error) {
    console.error('Error getting purchase history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get purchase history',
      message: error.message
    });
  }
};

/**
 * Get available subscription plans
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSubscriptionPlans = async (req, res) => {
  try {
    // Get subscription plans from database
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    // If no plans found in database, return default plans
    if (!plans || plans.length === 0) {
      const defaultPlans = [
        {
          id: 'free',
          name: 'Free',
          description: 'Basic access with limited features',
          price: 0,
          features: [
            '10 requests per day',
            'Basic AI features',
            'Standard support'
          ]
        },
        {
          id: 'eden',
          name: 'Eden',
          description: 'Enhanced access with more features',
          price: 9.99,
          features: [
            '100 requests per day',
            'Advanced AI features',
            'Email support',
            'File uploads'
          ]
        },
        {
          id: 'utopia',
          name: 'Utopia',
          description: 'Premium access with all features',
          price: 19.99,
          features: [
            'Unlimited requests',
            'All AI features',
            'Priority support',
            'Unlimited file uploads',
            'Custom integrations'
          ]
        }
      ];
      
      return res.status(200).json({
        success: true,
        plans: defaultPlans
      });
    }
    
    // Return subscription plans
    res.status(200).json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error getting subscription plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription plans',
      message: error.message
    });
  }
};

/**
 * Reset user's rate limit cache
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const resetRateLimitCache = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Reset rate limit cache for user
    rateLimitService.resetUserCache(userId);
    
    // Return success
    res.status(200).json({
      success: true,
      message: 'Rate limit cache reset successfully'
    });
  } catch (error) {
    console.error('Error resetting rate limit cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset rate limit cache',
      message: error.message
    });
  }
};

module.exports = {
  getSubscriptionStatus,
  getPurchaseHistory,
  getSubscriptionPlans,
  resetRateLimitCache
};
