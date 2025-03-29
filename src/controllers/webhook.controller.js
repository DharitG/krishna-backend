const { supabase } = require('../services/supabase');
const crypto = require('crypto');

/**
 * Handle RevenueCat webhook events
 * Documentation: https://www.revenuecat.com/docs/webhooks
 */
const handleRevenueCatWebhook = async (req, res) => {
  try {
    // Verify webhook signature if you've configured a shared secret in RevenueCat
    // This is optional but recommended for production
    const isValid = verifyWebhookSignature(req);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('Received RevenueCat webhook event:', event.type);

    // Process different event types
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
        await handleSubscriptionActive(event.data);
        break;
      
      case 'CANCELLATION':
        await handleSubscriptionCancelled(event.data);
        break;
      
      case 'EXPIRATION':
        await handleSubscriptionExpired(event.data);
        break;
      
      case 'PRODUCT_CHANGE':
        await handleSubscriptionChanged(event.data);
        break;
      
      case 'BILLING_ISSUE':
        await handleBillingIssue(event.data);
        break;
      
      default:
        console.log('Unhandled event type:', event.type);
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error processing RevenueCat webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify webhook signature using shared secret
 */
const verifyWebhookSignature = (req) => {
  // Get the signature from the headers
  const signature = req.headers['x-signature'];
  const sharedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  
  // Skip verification in development if no secret is set
  if (!signature || !sharedSecret) {
    console.warn('Webhook signature verification skipped: missing signature or secret');
    return process.env.NODE_ENV !== 'production';
  }
  
  try {
    const hmac = crypto.createHmac('sha256', sharedSecret);
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
};

/**
 * Handle subscription activation events (initial purchase or renewal)
 */
const handleSubscriptionActive = async (data) => {
  const { app_user_id, entitlement_id, product_id, expires_date, purchase_date } = data;
  
  try {
    // Determine plan ID from product ID
    let planId = '';
    if (product_id.includes('eden')) {
      planId = 'eden_monthly';
    } else if (product_id.includes('utopia')) {
      planId = 'utopia_monthly';
    } else {
      console.error('Unknown product ID:', product_id);
      return;
    }
    
    // Get user ID from app_user_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', app_user_id)
      .single();
    
    if (userError || !userData) {
      console.error('User not found for app_user_id:', app_user_id, userError);
      return;
    }
    
    const userId = userData.id;
    
    // Check if subscription already exists
    const { data: existingSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    const subscriptionData = {
      user_id: userId,
      plan_id: planId,
      revenuecat_customer_id: app_user_id,
      revenuecat_entitlement_id: entitlement_id,
      status: 'active',
      platform: data.platform || 'unknown',
      original_purchase_date: purchase_date,
      expires_date: expires_date,
      renewal_date: expires_date,
      is_trial: data.is_trial_period === 'true',
      updated_at: new Date().toISOString()
    };
    
    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update(subscriptionData)
        .eq('id', existingSub.id);
      
      if (updateError) {
        console.error('Error updating subscription:', updateError);
      }
    } else {
      // Create new subscription
      const { error: insertError } = await supabase
        .from('user_subscriptions')
        .insert(subscriptionData);
      
      if (insertError) {
        console.error('Error creating subscription:', insertError);
      }
    }
    
    // Record purchase in history
    const purchaseData = {
      user_id: userId,
      transaction_id: data.transaction_id || data.product_id,
      platform: data.platform || 'unknown',
      product_id: product_id,
      purchase_date: purchase_date,
      amount_usd: planId.includes('eden') ? 20.00 : 50.00,
    };
    
    const { error: purchaseError } = await supabase
      .from('purchase_history')
      .insert(purchaseData);
    
    if (purchaseError) {
      console.error('Error recording purchase history:', purchaseError);
    }
    
    // Clear rate limit cache for this user
    await clearRateLimitCache(userId);
    
  } catch (error) {
    console.error('Error processing subscription activation:', error);
  }
};

/**
 * Handle subscription cancellation events
 */
const handleSubscriptionCancelled = async (data) => {
  const { app_user_id } = data;
  
  try {
    // Get user ID from app_user_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', app_user_id)
      .single();
    
    if (userError || !userData) {
      console.error('User not found for app_user_id:', app_user_id, userError);
      return;
    }
    
    const userId = userData.id;
    
    // Update subscription status
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Error updating subscription to cancelled:', updateError);
    }
  } catch (error) {
    console.error('Error processing subscription cancellation:', error);
  }
};

/**
 * Handle subscription expiration events
 */
const handleSubscriptionExpired = async (data) => {
  const { app_user_id } = data;
  
  try {
    // Get user ID from app_user_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', app_user_id)
      .single();
    
    if (userError || !userData) {
      console.error('User not found for app_user_id:', app_user_id, userError);
      return;
    }
    
    const userId = userData.id;
    
    // Update subscription status
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({ 
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Error updating subscription to expired:', updateError);
    }
  } catch (error) {
    console.error('Error processing subscription expiration:', error);
  }
};

/**
 * Handle subscription change events (upgrade/downgrade)
 */
const handleSubscriptionChanged = async (data) => {
  const { app_user_id, entitlement_id, product_id, expires_date } = data;
  
  try {
    // Determine plan ID from product ID
    let planId = '';
    if (product_id.includes('eden')) {
      planId = 'eden_monthly';
    } else if (product_id.includes('utopia')) {
      planId = 'utopia_monthly';
    } else {
      console.error('Unknown product ID:', product_id);
      return;
    }
    
    // Get user ID from app_user_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', app_user_id)
      .single();
    
    if (userError || !userData) {
      console.error('User not found for app_user_id:', app_user_id, userError);
      return;
    }
    
    const userId = userData.id;
    
    // Update subscription with new plan
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({ 
        plan_id: planId,
        revenuecat_entitlement_id: entitlement_id,
        expires_date: expires_date,
        renewal_date: expires_date,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Error updating subscription plan:', updateError);
    }
    
    // Clear rate limit cache for this user
    await clearRateLimitCache(userId);
  } catch (error) {
    console.error('Error processing subscription change:', error);
  }
};

/**
 * Handle billing issue events
 */
const handleBillingIssue = async (data) => {
  const { app_user_id } = data;
  
  try {
    // Get user ID from app_user_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', app_user_id)
      .single();
    
    if (userError || !userData) {
      console.error('User not found for app_user_id:', app_user_id, userError);
      return;
    }
    
    const userId = userData.id;
    
    // Update subscription status
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({ 
        status: 'grace_period',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Error updating subscription to grace period:', updateError);
    }
  } catch (error) {
    console.error('Error processing billing issue:', error);
  }
};

/**
 * Clear rate limit cache for a user
 */
const clearRateLimitCache = async (userId) => {
  try {
    // Import rate limit service
    const rateLimitService = require('../services/ratelimit.service');
    
    // Reset the user's cache
    rateLimitService.resetUserCache(userId);
    
    console.log(`Cleared rate limit cache for user ${userId}`);
  } catch (error) {
    console.error('Error clearing rate limit cache:', error);
  }
};

module.exports = {
  handleRevenueCatWebhook
};
