require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection
const testConnection = async () => {
  try {
    // First check if we can connect to Supabase at all
    const { data, error } = await supabase.from('chats').select('count', { count: 'exact' }).limit(0);
    
    if (error) {
      throw error;
    }
    
    // Now specifically check if the user_accounts table exists
    const { data: accountsData, error: accountsError } = await supabase
      .from('user_accounts')
      .select('count', { count: 'exact' })
      .limit(0);
    
    if (accountsError) {
      console.error('Error accessing user_accounts table:', accountsError.message);
      console.error('The user_accounts table might not exist or has incorrect permissions.');
      console.error('Please check your Supabase schema.');
      return false;
    }
    
    console.log('Successfully connected to Supabase and verified user_accounts table');
    return true;
  } catch (error) {
    console.error('Error connecting to Supabase:', error.message);
    return false;
  }
};

module.exports = {
  supabase,
  testConnection
};