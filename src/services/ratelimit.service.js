const { supabase } = require('./supabase');
const { redisClient } = require('../middleware/ip-ratelimit.middleware');

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
    
    // Cache to avoid excessive database queries (used as fallback if Redis is not available)
    this.userPlanCache = new Map();
    this.userRequestCountCache = new Map();
    
    // Cache expiry time (1 hour)
    this.CACHE_TTL = 60 * 60 * 1000;
    
    // Redis available flag
    this.redisAvailable = !!redisClient;
    
    if (this.redisAvailable) {
      console.log('Redis is available for rate limiting');
    } else {
      console.log('Redis is not available, using in-memory cache for rate limiting');
    }
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
    // Try Redis first if available
    if (this.redisAvailable) {
      try {
        return new Promise((resolve, reject) => {
          redisClient.get(`plan:${userId}`, (err, cachedPlan) => {
            if (err) {
              // Redis error, fall back to in-memory cache
              console.error('Redis error getting plan:', err);
              return this.getPlanFromMemoryCache(userId, resolve, reject);
            }
            
            if (cachedPlan) {
              return resolve(cachedPlan);
            }
            
            // Not in Redis, get from database and store in Redis
            this.getPlanFromDatabase(userId)
              .then(plan => {
                // Store in Redis with expiry (1 hour)
                redisClient.setex(`plan:${userId}`, 3600, plan, (err) => {
                  if (err) console.error('Redis error setting plan:', err);
                });
                resolve(plan);
              })
              .catch(err => reject(err));
          });
        });
      } catch (error) {
        console.error('Error in Redis plan cache:', error);
        // Fall back to memory cache
        return this.getPlanFromMemoryCache(userId);
      }
    } else {
      // Redis not available, use memory cache
      return this.getPlanFromMemoryCache(userId);
    }
  }
  
  /**
   * Get plan from memory cache, fall back to database
   * @param {string} userId - The user ID
   * @returns {Promise<string>} - The plan name
   */
  async getPlanFromMemoryCache(userId) {
    // Check cache first
    const cachedPlan = this.userPlanCache.get(userId);
    if (cachedPlan && cachedPlan.expires > Date.now()) {
      return cachedPlan.plan;
    }
    
    // Not in cache, get from database
    const plan = await this.getPlanFromDatabase(userId);
    
    // Cache the result
    this.userPlanCache.set(userId, {
      plan,
      expires: Date.now() + this.CACHE_TTL
    });
    
    return plan;
  }
  
  /**
   * Get plan directly from database
   * @param {string} userId - The user ID
   * @returns {Promise<string>} - The plan name
   */
  async getPlanFromDatabase(userId) {
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
      
      return plan;
    } catch (error) {
      console.error('Error getting user plan from database:', error);
      return 'free'; // Default to free plan on error
    }
  }
  
  /**
   * Get user's request count for today
   * @param {string} userId - The user ID
   * @returns {Promise<number>} - The request count
   */
  async getUserRequestCount(userId) {
    // Get today's date at midnight UTC for the key
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateKey = today.toISOString().split('T')[0];
    
    // Try Redis first if available
    if (this.redisAvailable) {
      try {
        return new Promise((resolve, reject) => {
          redisClient.get(`count:${userId}:${dateKey}`, async (err, count) => {
            if (err) {
              // Redis error, fall back to memory cache
              console.error('Redis error getting count:', err);
              return resolve(await this.getCountFromMemoryCache(userId));
            }
            
            if (count !== null) {
              return resolve(parseInt(count));
            }
            
            // Not in Redis, get from database
            const dbCount = await this.getCountFromDatabase(userId, today);
            
            // Store in Redis with expiry (expires at end of day UTC + 1 hour)
            const now = new Date();
            const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
            const secondsUntilEndOfDay = Math.floor((endOfDay - now) / 1000) + 3600; // End of day + 1 hour
            
            redisClient.setex(`count:${userId}:${dateKey}`, secondsUntilEndOfDay, dbCount.toString(), (err) => {
              if (err) console.error('Redis error setting count:', err);
            });
            
            resolve(dbCount);
          });
        });
      } catch (error) {
        console.error('Error in Redis count cache:', error);
        // Fall back to memory cache
        return this.getCountFromMemoryCache(userId);
      }
    } else {
      // Redis not available, use memory cache
      return this.getCountFromMemoryCache(userId);
    }
  }
  
  /**
   * Get count from memory cache, fall back to database
   * @param {string} userId - The user ID
   * @returns {Promise<number>} - The request count
   */
  async getCountFromMemoryCache(userId) {
    // Check cache first
    const cachedCount = this.userRequestCountCache.get(userId);
    if (cachedCount && cachedCount.expires > Date.now()) {
      return cachedCount.count;
    }
    
    // Get today's date at midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // Not in cache, get from database
    const count = await this.getCountFromDatabase(userId, today);
    
    // Cache the result
    this.userRequestCountCache.set(userId, {
      count,
      expires: Date.now() + (5 * 60 * 1000) // 5 minute cache for counts
    });
    
    return count;
  }
  
  /**
   * Get count directly from database
   * @param {string} userId - The user ID
   * @param {Date} today - Today's date at midnight UTC
   * @returns {Promise<number>} - The request count
   */
  async getCountFromDatabase(userId, today) {
    try {
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
      
      return count;
    } catch (error) {
      console.error('Error getting user request count from database:', error);
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
      const dateKey = today.toISOString().split('T')[0];
      
      // Update database count
      const newCount = await this.incrementCountInDatabase(userId, today);
      
      // Update Redis if available
      if (this.redisAvailable) {
        try {
          // Increment in Redis and refresh expiry
          const now = new Date();
          const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
          const secondsUntilEndOfDay = Math.floor((endOfDay - now) / 1000) + 3600; // End of day + 1 hour
          
          redisClient.setex(`count:${userId}:${dateKey}`, secondsUntilEndOfDay, newCount.toString(), (err) => {
            if (err) console.error('Redis error updating count:', err);
          });
        } catch (error) {
          console.error('Redis update error:', error);
        }
      }
      
      // Update memory cache if it exists
      const cachedCount = this.userRequestCountCache.get(userId);
      if (cachedCount) {
        this.userRequestCountCache.set(userId, {
          count: newCount,
          expires: cachedCount.expires
        });
      }
    } catch (error) {
      console.error('Error incrementing user request count:', error);
    }
  }
  
  /**
   * Increment count in database
   * @param {string} userId - The user ID
   * @param {Date} today - Today's date at midnight UTC
   * @returns {Promise<number>} - The new count
   */
  async incrementCountInDatabase(userId, today) {
    try {
      // Update request count in database
      const { data, error } = await supabase
        .from('user_request_counts')
        .select('id, count')
        .eq('user_id', userId)
        .gte('date', today.toISOString())
        .single();
      
      let newCount = 1;
      
      if (!error && data) {
        // Update existing record
        newCount = data.count + 1;
        await supabase
          .from('user_request_counts')
          .update({ count: newCount })
          .eq('id', data.id);
      } else {
        // Create a new record
        await supabase
          .from('user_request_counts')
          .insert({
            user_id: userId,
            date: today.toISOString(),
            count: 1
          });
      }
      
      return newCount;
    } catch (error) {
      console.error('Error incrementing count in database:', error);
      return 1; // Default to 1 on error
    }
  }
  
  /**
   * Reset the cache for a specific user
   * @param {string} userId - The user ID
   */
  resetUserCache(userId) {
    // Clear memory cache
    this.userPlanCache.delete(userId);
    this.userRequestCountCache.delete(userId);
    
    // Clear Redis cache if available
    if (this.redisAvailable) {
      try {
        redisClient.del(`plan:${userId}`, (err) => {
          if (err) console.error('Redis error deleting plan:', err);
        });
        
        // Get today's date for the count key
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const dateKey = today.toISOString().split('T')[0];
        
        redisClient.del(`count:${userId}:${dateKey}`, (err) => {
          if (err) console.error('Redis error deleting count:', err);
        });
      } catch (error) {
        console.error('Error clearing Redis cache:', error);
      }
    }
  }
}

// Create singleton instance
const rateLimitService = new RateLimitService();

module.exports = rateLimitService;
