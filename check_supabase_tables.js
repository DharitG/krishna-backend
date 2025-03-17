/**
 * This script checks if the required tables exist in Supabase
 */
require('dotenv').config();
const { supabase } = require('./src/services/supabase');

async function checkTables() {
  try {
    console.log('Checking Supabase tables...');
    
    // Check if user_accounts table exists
    const { data: userAccountsData, error: userAccountsError } = await supabase
      .from('user_accounts')
      .select('count', { count: 'exact' })
      .limit(0);
    
    if (userAccountsError) {
      console.error('Error accessing user_accounts table:', userAccountsError.message);
      console.error('The user_accounts table might not exist or has incorrect permissions.');
      
      // Check if we can query the list of tables
      const { data: tablesData, error: tablesError } = await supabase
        .rpc('get_tables');
      
      if (tablesError) {
        console.error('Error getting tables list:', tablesError.message);
      } else {
        console.log('Available tables:', tablesData);
      }
      
      return false;
    }
    
    console.log('user_accounts table exists!');
    
    // Get a sample of data from the user_accounts table
    const { data: sampleData, error: sampleError } = await supabase
      .from('user_accounts')
      .select('*')
      .limit(5);
    
    if (sampleError) {
      console.error('Error getting sample data:', sampleError.message);
    } else {
      console.log('Sample data from user_accounts table:');
      console.log(sampleData);
    }
    
    return true;
  } catch (error) {
    console.error('Unexpected error:', error);
    return false;
  }
}

// Run the check if this file is executed directly
if (require.main === module) {
  checkTables()
    .then(success => {
      if (success) {
        console.log('Supabase tables check completed successfully!');
      } else {
        console.error('Supabase tables check failed!');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}
