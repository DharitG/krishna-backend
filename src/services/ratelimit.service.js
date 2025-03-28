const { supabase } = require('./supabase');

/**
 * Rate limiting service to control access based on subscription tiers
 */
class RateLimitService {
  constructor() {
    // Rate limits for different subscription tiers (requests per day)
    this.RATE_LIMITS = {
      free: 10,
      eden: 100,
      utopia: Infinity // Unlimited
    };
    
    // Cache to avoid excessive database queries
    this.userPlanCache = new Map();
    this.userRequestCountCache = new Map();
    
    // Cache expiry time (1 hour)
    this.CACHE_TTL = 60 * 60 * 1000;
  }
  
  /**
   * Check if a user has exceeded their rate limit
   * @param {string} userId - The user ID to check
   * @returns {Promise<Object>} - Object with isAllowed and remaining properties
   */
  async checkRateLimit(userId) {
    try {
      // Get user's subscription plan
      const plan = await this.getUserPlan(userId);
      
      // Get rate limit for the plan
      const limit = this.RATE_LIMITS[plan] || this.RATE_LIMITS.free;
      
      // If unlimited, return immediately
      if (limit === Infinity) {
        return {
          isAllowed: true,
          remaining: Infinity,
          plan,
          limit
        };
      }
      
      // Get current request count for today
      const count = await this.getUserRequestCount(userId);
      
      // Check if user has exceeded their limit
      const isAllowed = count < limit;
      const remaining = Math.max(0, limit - count);
      
      // If allowed, increment the count
      if (isAllowed) {
        await this.incrementUserRequestCount(userId);
      }
      
      return {
        isAllowed,
        remaining,
        plan,
        limit
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Default to allowed in case of error to avoid blocking users
      return {
        isAllowed: true,
        remaining: 1,
        plan: 'free',
        limit: this.RATE_LIMITS.free,
        error: error.message
      };
    }
  }
  
  /**
   * Get user's current subscription plan
   * @param {string} userId - The user ID
   * @returns {Promise<string>} - The plan name (free, eden, utopia)
   */
  async getUserPlan(userId) {
    // Check cache first
    const cachedPlan = this.userPlanCache.get(userId);
    if (cachedPlan && cachedPlan.expires > Date.now()) {
      return cachedPlan.plan;
    }
    
    try {
      // Query user's subscription from database
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('plan_id, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();
      
      let plan = 'free';
      
      if (!error && data) {
        if (data.plan_id.includes('utopia')) {
          plan = 'utopia';
        } else if (data.plan_id.includes('eden')) {
          plan = 'eden';
        }
      }
      
      // Cache the result
      this.userPlanCache.set(userId, {
        plan,
        expires: Date.now() + this.CACHE_TTL
      });
      
      return plan;
    } catch (error) {
      console.error('Error getting user plan:', error);
      return 'free'; // Default to free plan on error
    }
  }
  
  /**
   * Get user's request count for today
   * @param {string} userId - The user ID
   * @returns {Promise<number>} - The request count
   */
  async getUserRequestCount(userId) {
    // Check cache first
    const cachedCount = this.userRequestCountCache.get(userId);
    if (cachedCount && cachedCount.expires > Date.now()) {
      return cachedCount.count;
    }
    
    try {
      // Get today's date at midnight UTC
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // Query request count from database
      const { data, error } = await supabase
        .from('user_request_counts')
        .select('count')
        .eq('user_id', userId)
        .gte('date', today.toISOString())
        .single();
      
      let count = 0;
      
      if (!error && data) {
        count = data.count;
      } else {
        // Create a new record for today
        await supabase
          .from('user_request_counts')
          .insert({
            user_id: userId,
            date: today.toISOString(),
            count: 0
          });
      }
      
      // Cache the result
      this.userRequestCountCache.set(userId, {
        count,
        expires: Date.now() + (5 * 60 * 1000) // 5 minute cache for counts
      });
      
      return count;
    } catch (error) {
      console.error('Error getting user request count:', error);
      return 0; // Default to 0 on error
    }
  }
  
  /**
   * Increment user's request count for today
   * @param {string} userId - The user ID
   * @returns {Promise<void>}
   */
  async incrementUserRequestCount(userId) {
    try {
      // Get today's date at midnight UTC
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // Update request count in database
      const { data, error } = await supabase
        .from('user_request_counts')
        .select('id, count')
        .eq('user_id', userId)
        .gte('date', today.toISOString())
        .single();
      
      if (!error && data) {
        // Update existing record
        await supabase
          .from('user_request_counts')
          .update({ count: data.count + 1 })
          .eq('id', data.id);
          
        // Update cache
        const cachedCount = this.userRequestCountCache.get(userId);
        if (cachedCount) {
          this.userRequestCountCache.set(userId, {
            count: cachedCount.count + 1,
            expires: cachedCount.expires
          });
        }
      } else {
        // Create a new record
        await supabase
          .from('user_request_counts')
          .insert({
            user_id: userId,
            date: today.toISOString(),
            count: 1
          });
          
        // Update cache
        this.userRequestCountCache.set(userId, {
          count: 1,
          expires: Date.now() + (5 * 60 * 1000) // 5 minute cache
        });
      }
    } catch (error) {
      console.error('Error incrementing user request count:', error);
    }
  }
  
  /**
   * Reset the cache for a specific user
   * @param {string} userId - The user ID
   */
  resetUserCache(userId) {
    this.userPlanCache.delete(userId);
    this.userRequestCountCache.delete(userId);
  }
}

// Create singleton instance
const rateLimitService = new RateLimitService();

module.exports = rateLimitService;
