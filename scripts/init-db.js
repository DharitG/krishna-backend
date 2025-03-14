require('dotenv').config();
const { initDatabase } = require('../src/models');

// Parse command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');

// Warning for force option
if (force) {
  console.log('\x1b[31m%s\x1b[0m', '⚠️  WARNING: Using --force will drop all existing tables and data!');
  console.log('\x1b[31m%s\x1b[0m', '⚠️  This operation cannot be undone.');
  console.log('\x1b[31m%s\x1b[0m', '⚠️  Press Ctrl+C to cancel or wait 5 seconds to proceed...');
  
  // Wait for 5 seconds before proceeding
  setTimeout(async () => {
    try {
      await initDatabase(force);
      console.log('\x1b[32m%s\x1b[0m', '✅ Database initialized successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', '❌ Error initializing database:');
      console.error(error);
      process.exit(1);
    }
  }, 5000);
} else {
  // Initialize without dropping tables
  (async () => {
    try {
      await initDatabase(force);
      console.log('\x1b[32m%s\x1b[0m', '✅ Database initialized successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', '❌ Error initializing database:');
      console.error(error);
      process.exit(1);
    }
  })();
}