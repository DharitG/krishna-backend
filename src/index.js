// This file is the application entry point
require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./services/supabase');

// Start server
const PORT = process.env.PORT || 3000;

// Test Supabase connection and then start the server
(async () => {
  try {
    // Test Supabase connection
    const connected = await testConnection();
    
    if (!connected) {
      console.error('Failed to connect to Supabase. Please check your configuration.');
      process.exit(1);
    }
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API base URL: http://localhost:${PORT}/api`);
      console.log(`Supabase: Connected ✅`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
})();