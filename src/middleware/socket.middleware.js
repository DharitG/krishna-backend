// Socket.io authentication middleware
const { supabase } = require('../services/supabase');

/**
 * Authenticate socket connections using JWT token
 * @param {Object} socket - Socket.io socket object
 * @param {Function} next - Next function to call
 */
const authenticateSocket = async (socket, next) => {
  try {
    // Get the token from the handshake query or headers
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.warn('No authentication token provided for socket connection');
      // Allow connection without authentication for now
      // You can restrict this in production
      socket.user = { id: 'anonymous', anonymous: true };
      return next();
    }
    
    // Verify the JWT token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      console.error('Socket authentication error:', error);
      // Allow connection without authentication for now
      // You can restrict this in production
      socket.user = { id: 'anonymous', anonymous: true };
      return next();
    }
    
    // Attach user data to the socket
    socket.user = data.user;
    console.log(`Socket authenticated for user: ${socket.user.id}`);
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    // Allow connection without authentication for now
    // You can restrict this in production
    socket.user = { id: 'anonymous', anonymous: true };
    next();
  }
};

module.exports = {
  authenticateSocket
};
