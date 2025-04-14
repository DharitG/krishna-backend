require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/services/supabase');

async function initMemorySystem() {
  try {
    console.log('Initializing memory system...');
    
    // Read the memory system SQL file
    const schemaFilePath = path.join(__dirname, '../src/db/migrations/create_user_memories_table.sql');
    const schemaSql = fs.readFileSync(schemaFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: schemaSql });
    
    if (error) {
      console.error('Error creating memory system schema:', error);
      process.exit(1);
    }
    
    console.log('Memory system initialized successfully!');
    
    // Verify table was created
    const { data: tables, error: tablesError } = await supabase
      .from('user_memories')
      .select('id')
      .limit(1);
    
    if (tablesError) {
      console.error('Error verifying memory tables:', tablesError);
    } else {
      console.log('Memory tables created successfully');
    }
    
    return true;
  } catch (error) {
    console.error('Unexpected error initializing memory system:', error);
    process.exit(1);
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  initMemorySystem();
}

module.exports = { initMemorySystem };
