const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service key for admin rights

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be defined in .env file');
  process.exit(1);
}

// Initialize Supabase client with admin privileges
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function initSubscriptionSchema() {
  try {
    console.log('Initializing subscription schema...');
    
    // Read the subscription schema SQL file
    const schemaFilePath = path.join(__dirname, '../supabase/subscription_schema.sql');
    const schemaSql = fs.readFileSync(schemaFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: schemaSql });
    
    if (error) {
      console.error('Error creating subscription schema:', error);
      process.exit(1);
    }
    
    console.log('Subscription schema initialized successfully!');
    
    // Verify tables were created
    const { data: tables, error: tablesError } = await supabase
      .from('subscription_plans')
      .select('id, name, price_usd')
      .limit(5);
    
    if (tablesError) {
      console.error('Error verifying tables:', tablesError);
    } else {
      console.log('Subscription plans created:');
      console.table(tables);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

initSubscriptionSchema();