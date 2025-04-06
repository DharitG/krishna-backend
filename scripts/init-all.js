require('dotenv').config();
const { initDatabase } = require('./init-db');
const { initSubscriptionSchema } = require('./init-subscription');
const { initMemorySystem } = require('./init-memory-system');

async function initAll() {
  try {
    console.log('Initializing all systems...');
    
    // Initialize database
    console.log('\n=== Initializing Database ===');
    await initDatabase(false);
    
    // Initialize subscription schema
    console.log('\n=== Initializing Subscription Schema ===');
    await initSubscriptionSchema();
    
    // Initialize memory system
    console.log('\n=== Initializing Memory System ===');
    await initMemorySystem();
    
    console.log('\n✅ All systems initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error initializing systems:', error);
    process.exit(1);
  }
}

// Run the initialization if this file is executed directly
if (require.main === module) {
  initAll();
}

module.exports = { initAll };
