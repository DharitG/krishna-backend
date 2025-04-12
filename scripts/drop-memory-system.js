require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/services/supabase');

async function dropMemorySystem() {
  try {
    console.log('Dropping memory system...');
    
    // Read the drop memory system SQL file
    const schemaFilePath = path.join(__dirname, '../src/db/migrations/drop_memory_system.sql');
    const schemaSql = fs.readFileSync(schemaFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: schemaSql });
    
    if (error) {
      console.error('Error dropping memory system schema:', error);
      process.exit(1);
    }
    
    console.log('Memory system dropped successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error dropping memory system:', error);
    process.exit(1);
  }
}

// Run the function
dropMemorySystem();
