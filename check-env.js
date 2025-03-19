// Simple script to check if environment variables are set
require('dotenv').config();

console.log('Checking environment variables:');
console.log('------------------------------');
console.log('BACKEND_URL:', process.env.BACKEND_URL ? 'Set ✅' : 'Not set ❌');
console.log('COMPOSIO_API_KEY:', process.env.COMPOSIO_API_KEY ? 'Set ✅' : 'Not set ❌');
console.log('------------------------------');
console.log('Note: This script does not show the actual values for security reasons');
