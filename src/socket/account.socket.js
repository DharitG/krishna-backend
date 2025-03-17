/**
 * WebSocket handler for account-related events
 */
const { supabase } = require('../services/supabase');

/**
 * Initialize account socket handlers
 * @param {Object} io - Socket.io instance
 * @param {Object} socket - Socket connection
 * @param {Object} user - Authenticated user
 */
const initAccountSocket = (io, socket, user) => {
  console.log(`Initializing account socket for user ${user.id}`);
  
  // Join a room specific to this user
  socket.join(user.id);
  
  // Handle account refresh request
  socket.on('account:refresh', async () => {
    try {
      // Get all accounts from the database
      const { data: accounts, error } = await supabase
        .from('user_accounts')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Error fetching accounts via socket:', error);
        socket.emit('account:error', { 
          message: 'Error fetching accounts', 
          error: error.message 
        });
        return;
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
      
      // Send the accounts to the client
      socket.emit('account:refresh:success', {
        accounts: groupedAccounts
      });
    } catch (error) {
      console.error('Unexpected error in account:refresh socket handler:', error);
      socket.emit('account:error', { 
        message: 'Unexpected error refreshing accounts', 
        error: error.message 
      });
    }
  });
  
  // Handle account status check
  socket.on('account:status', async (data) => {
    try {
      const { serviceName } = data;
      
      if (!serviceName) {
        socket.emit('account:error', { 
          message: 'Service name is required' 
        });
        return;
      }
      
      // Get active account for the service
      const { data: activeAccount, error } = await supabase
        .from('user_accounts')
        .select('id, username, email, workspace')
        .eq('user_id', user.id)
        .eq('service_name', serviceName)
        .eq('is_active', true)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows returned" which is fine
        console.error(`Error fetching active ${serviceName} account:`, error);
        socket.emit('account:error', { 
          message: `Error fetching active ${serviceName} account`, 
          error: error.message 
        });
        return;
      }
      
      // Send the status to the client
      socket.emit('account:status:success', {
        serviceName,
        hasActiveAccount: !!activeAccount,
        activeAccount: activeAccount || null
      });
    } catch (error) {
      console.error('Unexpected error in account:status socket handler:', error);
      socket.emit('account:error', { 
        message: 'Unexpected error checking account status', 
        error: error.message 
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Account socket disconnected for user ${user.id}`);
  });
};

module.exports = { initAccountSocket };
