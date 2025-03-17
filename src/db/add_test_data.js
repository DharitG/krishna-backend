require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../services/supabase');

async function addTestData() {
  try {
    console.log('Adding test data to user_accounts table...');
    
    // User ID from your logs
    const userId = '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a';
    
    // Check if there's already data for this user
    const { data: existingAccounts, error: countError } = await supabase
      .from('user_accounts')
      .select('id')
      .eq('user_id', userId);
    
    if (countError) {
      console.error('Error checking existing accounts:', countError);
      return false;
    }
    
    if (existingAccounts && existingAccounts.length > 0) {
      console.log(`User already has ${existingAccounts.length} accounts. Skipping test data insertion.`);
      return true;
    }
    
    // Add GitHub account
    const { error: githubError } = await supabase
      .from('user_accounts')
      .insert([{
        id: uuidv4(),
        user_id: userId,
        service_name: 'github',
        username: 'user1',
        email: 'user1@github.com',
        is_active: true,
        created_at: new Date().toISOString()
      }]);
    
    if (githubError) {
      console.error('Error adding GitHub account:', githubError);
      return false;
    }
    
    // Add Slack account
    const { error: slackError } = await supabase
      .from('user_accounts')
      .insert([{
        id: uuidv4(),
        user_id: userId,
        service_name: 'slack',
        username: 'user1',
        workspace: 'Workspace 1',
        is_active: true,
        created_at: new Date().toISOString()
      }]);
    
    if (slackError) {
      console.error('Error adding Slack account:', slackError);
      return false;
    }
    
    // Add Gmail account
    const { error: gmailError } = await supabase
      .from('user_accounts')
      .insert([{
        id: uuidv4(),
        user_id: userId,
        service_name: 'gmail',
        email: 'user@gmail.com',
        is_active: true,
        created_at: new Date().toISOString()
      }]);
    
    if (gmailError) {
      console.error('Error adding Gmail account:', gmailError);
      return false;
    }
    
    console.log('Test data added successfully!');
    return true;
  } catch (error) {
    console.error('Unexpected error adding test data:', error);
    return false;
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  addTestData()
    .then(success => {
      if (success) {
        console.log('Test data added successfully!');
      } else {
        console.error('Failed to add test data!');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { addTestData };
