/**
 * This script checks and fixes issues with the accounts endpoint
 */
require('dotenv').config();
const axios = require('axios');
const { setupDatabase } = require('./src/db/setup_database');

// API URL
const API_URL = 'http://localhost:3000/api';

async function checkEndpoint() {
  try {
    console.log('Checking accounts endpoint...');
    
    // First, set up the database to ensure the user_accounts table exists
    await setupDatabase();
    
    // Get the auth token
    // This is just a test - in a real app, you would need to get a valid token
    const token = 'test_token';
    
    // Try to access the accounts endpoint
    try {
      const response = await axios.get(`${API_URL}/accounts`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      console.log('Accounts endpoint is working!');
      console.log('Response:', response.data);
      return true;
    } catch (error) {
      console.error('Error accessing accounts endpoint:', error.message);
      
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
        
        // Check if it's a 404 error
        if (error.response.status === 404) {
          console.error('The accounts endpoint is not found. This could be due to:');
          console.error('1. The route is not properly registered in app.js');
          console.error('2. The server is not running');
          console.error('3. The URL is incorrect');
        }
      }
      
      return false;
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return false;
  }
}

// Run the check if this file is executed directly
if (require.main === module) {
  checkEndpoint()
    .then(success => {
      if (success) {
        console.log('Accounts endpoint check completed successfully!');
      } else {
        console.error('Accounts endpoint check failed!');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}
