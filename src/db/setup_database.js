require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../services/supabase');

async function setupDatabase() {
  try {
    console.log('Setting up database...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'create_user_accounts_table.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      console.error('Error setting up database:', error);
      return false;
    }
    
    console.log('Database setup completed successfully!');
    return true;
  } catch (error) {
    console.error('Unexpected error setting up database:', error);
    return false;
  }
}

// Run the setup if this file is executed directly
if (require.main === module) {
  setupDatabase()
    .then(success => {
      if (success) {
        console.log('Database setup completed successfully!');
      } else {
        console.error('Database setup failed!');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase };
