const { supabase } = require('../services/supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * Get all accounts for a user
 */
exports.getAccounts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get all accounts from the database
    const { data: accounts, error } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching accounts:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching accounts', 
        error: error.message 
      });
    }
    
    // Group accounts by service
    const groupedAccounts = {};
    
    // Initialize with empty arrays for common services
    const services = ['github', 'slack', 'gmail', 'discord', 'zoom', 'asana'];
    services.forEach(service => {
      groupedAccounts[service] = [];
    });
    
    // Add accounts to their respective service groups
    if (accounts && accounts.length > 0) {
      accounts.forEach(account => {
        if (!groupedAccounts[account.service_name]) {
          groupedAccounts[account.service_name] = [];
        }
        
        groupedAccounts[account.service_name].push({
          id: account.id,
          username: account.username,
          email: account.email,
          workspace: account.workspace,
          isActive: account.is_active,
          createdAt: account.created_at
        });
      });
    }
    
    res.json({
      success: true,
      accounts: groupedAccounts
    });
  } catch (error) {
    console.error('Unexpected error in getAccounts:', error);
    next(error);
  }
};

/**
 * Add a new account
 */
exports.addAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { serviceName, accountData } = req.body;
    
    if (!serviceName || !accountData) {
      return res.status(400).json({
        success: false,
        message: 'Service name and account data are required'
      });
    }
    
    // Check if this is the first account for this service
    const { data: existingAccounts, error: countError } = await supabase
      .from('user_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('service_name', serviceName);
    
    if (countError) {
      console.error('Error checking existing accounts:', countError);
      return res.status(500).json({
        success: false,
        message: 'Error checking existing accounts',
        error: countError.message
      });
    }
    
    // Set as active if it's the first account for this service
    const isActive = !existingAccounts || existingAccounts.length === 0;
    
    // Insert the new account
    const { data: newAccount, error } = await supabase
      .from('user_accounts')
      .insert([{
        id: uuidv4(),
        user_id: userId,
        service_name: serviceName,
        username: accountData.username || null,
        email: accountData.email || null,
        workspace: accountData.workspace || null,
        access_token: accountData.accessToken || null,
        refresh_token: accountData.refreshToken || null,
        expires_at: accountData.expiresAt || null,
        is_active: isActive,
        metadata: accountData.metadata || {}
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error adding account:', error);
      return res.status(500).json({
        success: false,
        message: 'Error adding account',
        error: error.message
      });
    }
    
    // Format the response
    const formattedAccount = {
      id: newAccount.id,
      username: newAccount.username,
      email: newAccount.email,
      workspace: newAccount.workspace,
      isActive: newAccount.is_active,
      createdAt: newAccount.created_at
    };
    
    // Emit WebSocket event for real-time updates
    if (req.io) {
      req.io.to(userId).emit('account_update', {
        type: 'add',
        serviceName,
        account: formattedAccount
      });
    }
    
    res.status(201).json({
      success: true,
      account: formattedAccount
    });
  } catch (error) {
    console.error('Unexpected error in addAccount:', error);
    next(error);
  }
};

/**
 * Remove an account
 */
exports.removeAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;
    
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required'
      });
    }
    
    // Get the account to check if it exists and get the service name
    const { data: account, error: fetchError } = await supabase
      .from('user_accounts')
      .select('service_name, is_active')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching account:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Account not found',
        error: fetchError.message
      });
    }
    
    // Delete the account
    const { error } = await supabase
      .from('user_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error removing account:', error);
      return res.status(500).json({
        success: false,
        message: 'Error removing account',
        error: error.message
      });
    }
    
    // If the removed account was active, set another account as active
    if (account.is_active) {
      const { data: otherAccounts, error: otherError } = await supabase
        .from('user_accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('service_name', account.service_name)
        .limit(1);
      
      if (!otherError && otherAccounts && otherAccounts.length > 0) {
        // Set the first account as active
        await supabase
          .from('user_accounts')
          .update({ is_active: true })
          .eq('id', otherAccounts[0].id)
          .eq('user_id', userId);
      }
    }
    
    // Emit WebSocket event for real-time updates
    if (req.io) {
      req.io.to(userId).emit('account_update', {
        type: 'remove',
        serviceName: account.service_name,
        accountId
      });
    }
    
    res.json({
      success: true,
      message: 'Account removed successfully'
    });
  } catch (error) {
    console.error('Unexpected error in removeAccount:', error);
    next(error);
  }
};

/**
 * Set an account as active
 */
exports.setActiveAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;
    
    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required'
      });
    }
    
    // Get the account to check if it exists and get the service name
    const { data: account, error: fetchError } = await supabase
      .from('user_accounts')
      .select('service_name')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching account:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Account not found',
        error: fetchError.message
      });
    }
    
    // First, set all accounts for this service as inactive
    const { error: updateAllError } = await supabase
      .from('user_accounts')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('service_name', account.service_name);
    
    if (updateAllError) {
      console.error('Error updating accounts:', updateAllError);
      return res.status(500).json({
        success: false,
        message: 'Error updating accounts',
        error: updateAllError.message
      });
    }
    
    // Then, set the specified account as active
    const { error } = await supabase
      .from('user_accounts')
      .update({ is_active: true })
      .eq('id', accountId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error setting active account:', error);
      return res.status(500).json({
        success: false,
        message: 'Error setting active account',
        error: error.message
      });
    }
    
    // Emit WebSocket event for real-time updates
    if (req.io) {
      req.io.to(userId).emit('account_update', {
        type: 'setActive',
        serviceName: account.service_name,
        accountId
      });
    }
    
    res.json({
      success: true,
      message: 'Account set as active successfully'
    });
  } catch (error) {
    console.error('Unexpected error in setActiveAccount:', error);
    next(error);
  }
};

/**
 * Initiate OAuth authentication for a service
 */
exports.initiateOAuth = async (req, res, next) => {
  try {
    const { serviceName } = req.params;
    
    // This would normally generate OAuth URLs based on the service
    // For now, we'll return mock URLs
    const mockRedirectUrls = {
      github: 'https://github.com/login/oauth/authorize?client_id=mock_client_id&scope=user,repo',
      slack: 'https://slack.com/oauth/v2/authorize?client_id=mock_client_id&scope=chat:write,channels:read',
      gmail: 'https://accounts.google.com/o/oauth2/auth?client_id=mock_client_id&scope=email,profile',
      discord: 'https://discord.com/api/oauth2/authorize?client_id=mock_client_id&scope=identify,guilds',
      zoom: 'https://zoom.us/oauth/authorize?client_id=mock_client_id&response_type=code&redirect_uri=mock_redirect',
      asana: 'https://app.asana.com/-/oauth_authorize?client_id=mock_client_id&response_type=code'
    };
    
    const redirectUrl = mockRedirectUrls[serviceName];
    
    if (!redirectUrl) {
      return res.status(400).json({
        success: false,
        message: `Authentication not supported for ${serviceName}`
      });
    }
    
    res.json({
      success: true,
      redirectUrl
    });
  } catch (error) {
    console.error('Unexpected error in initiateOAuth:', error);
    next(error);
  }
};

/**
 * Handle OAuth callback
 */
exports.handleOAuthCallback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { serviceName } = req.params;
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }
    
    // This would normally exchange the code for tokens and fetch user info
    // For now, we'll use mock data
    const mockUserData = {
      github: { username: 'github_user', email: 'user@github.com' },
      slack: { username: 'slack_user', workspace: 'Workspace' },
      gmail: { email: 'user@gmail.com' },
      discord: { username: 'discord_user' },
      zoom: { email: 'user@zoom.us', name: 'Zoom User' },
      asana: { username: 'asana_user', email: 'user@asana.com' }
    };
    
    const userData = mockUserData[serviceName];
    
    if (!userData) {
      return res.status(400).json({
        success: false,
        message: `User data not available for ${serviceName}`
      });
    }
    
    // Check if this account already exists
    let query = supabase
      .from('user_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('service_name', serviceName);
    
    // Add email or username condition if available
    if (userData.email) {
      query = query.eq('email', userData.email);
    } else if (userData.username) {
      query = query.eq('username', userData.username);
    }
    
    const { data: existingAccount, error: checkError } = await query;
    
    if (checkError) {
      console.error('Error checking existing account:', checkError);
      return res.status(500).json({
        success: false,
        message: 'Error checking existing account',
        error: checkError.message
      });
    }
    
    if (existingAccount && existingAccount.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Account already exists'
      });
    }
    
    // Add the account using the addAccount function
    req.body = {
      serviceName,
      accountData: {
        ...userData,
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      }
    };
    
    next();
  } catch (error) {
    console.error('Unexpected error in handleOAuthCallback:', error);
    next(error);
  }
};
