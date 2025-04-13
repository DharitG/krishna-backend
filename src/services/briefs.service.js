// Service for handling brief generation, storage, and scheduling

const { supabase } = require('./supabase');
const composioService = require('./composio.service'); // Using Composio for tools
const openaiService = require('./openai.service'); // Using OpenAI for generation
const cron = require('node-cron');

// Potential tool names - VERIFICATION NEEDED
// Arguments for these tools (e.g., date range for calendar) also need verification.
const MORNING_BRIEF_TOOL_CONFIGS = [
  { name: 'gmail.read_emails', args: { max_results: 5, query: 'is:important is:unread category:primary' } }, // Example args: Fetch 5 important, unread emails from primary inbox
  { name: 'googlecalendar.list_events', args: { timeMin: new Date().toISOString(), maxResults: 5, singleEvents: true, orderBy: 'startTime' } }, // Example args: Fetch next 5 upcoming events today
  { name: 'weathermap.get_forecast', args: { q: 'YOUR_DEFAULT_CITY' } }, // Example args - NEEDS LOCATION - Replace YOUR_DEFAULT_CITY or fetch user location preference
  // { name: 'fitbit.get_health_data', args: { /* ... */ } }, // Example if health data is needed
  // { name: 'todoist.get_tasks', args: { filter: "today | overdue" } }, // Example if tasks are needed
];

class BriefsService {

  /**
   * Gathers data from multiple tools required for a brief.
   * @param {string} userId - The ID of the user.
   * @param {Array} toolConfigs - Array of tool configurations { name: string, args: object }.
   * @returns {Promise<object>} - An object mapping tool names to their results.
   */
  async gatherBriefData(userId, toolConfigs) {
    console.log(`Gathering data for brief for user ${userId} using ${toolConfigs.length} tools.`);

    if (!composioService.isConfigured) {
        console.error("Composio service is not configured. Cannot gather brief data.");
        throw new Error("Composio service is not configured.");
    }

    // TODO: Fetch user preferences (e.g., location for weather) if needed for args
    // let userPrefs = await fetchUserPreferences(userId);
    // let location = userPrefs.location || 'YOUR_DEFAULT_CITY'; // Get location

    const toolPromises = toolConfigs.map(config => {
      // Dynamically set location for weather if needed
      let currentArgs = { ...config.args };
      if (config.name === 'weathermap.get_forecast') {
         // currentArgs.q = location; // Use fetched location
         console.warn("Weather tool location is hardcoded. Implement user preference fetching.");
      }

      // Construct the tool call object expected by composioService.handleToolCalls
      // Based on composio.service.js, it seems to expect an array of these objects.
      const toolCall = {
          function: {
              name: config.name,
              // Ensure arguments are stringified if the tool expects it
              arguments: JSON.stringify(currentArgs || {}),
          }
      };

      console.log(`Preparing tool call for: ${config.name} with args: ${toolCall.function.arguments}`);
      // Pass empty authStatus for now, assuming handleToolCalls manages it
      return composioService.handleToolCalls([toolCall], {}, userId)
        .then(result => ({ name: config.name, data: result })) // Wrap result with tool name
        .catch(error => {
          console.error(`Error calling tool ${config.name} for user ${userId}:`, error.message);
          return { name: config.name, error: error.message }; // Return error information
        });
    });

    const results = await Promise.allSettled(toolPromises);

    const collectedData = {};
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
         const toolResult = result.value;
         // Check the structure returned by handleToolCalls
         if(toolResult.data && toolResult.data.result && typeof toolResult.data.result.output !== 'undefined') {
             collectedData[toolResult.name] = toolResult.data.result.output;
         } else if (toolResult.data && toolResult.data.status === 'error') {
             collectedData[toolResult.name] = { error: `Tool execution failed: ${toolResult.data.error || 'Unknown error'}` };
         } else if (toolResult.error) {
             collectedData[toolResult.name] = { error: `Tool execution failed: ${toolResult.error}` };
         } else {
             collectedData[toolResult.name] = { error: 'Tool execution failed or returned unexpected structure' };
             console.warn(`Unexpected result structure for tool ${toolResult.name}:`, JSON.stringify(toolResult, null, 2));
         }
      } else if (result.status === 'rejected') {
        console.error(`Promise rejected for a tool call:`, result.reason);
        // Attempt to identify the failed tool if possible from the input configs
        collectedData['unknown_tool_rejected'] = { error: `Tool call promise rejected: ${result.reason}` };
      }
    });

    console.log(`Finished gathering data for user ${userId}.`);
    return collectedData;
  }

  /**
   * Generates a brief summary from collected data using an LLM.
   * @param {string} userId - The ID of the user.
   * @param {object} data - Data collected from tools (key: tool name, value: result/error).
   * @returns {Promise<string>} - The generated brief content.
   */
  async generateBriefFromData(userId, data) {
    console.log(`Generating brief from data for user ${userId}`);

    if (!openaiService.isConfigured) {
        console.error("OpenAI service is not configured. Cannot generate brief.");
        throw new Error("OpenAI service is not configured.");
    }

    // Prepare data for the prompt, handling potential errors from tools
    let dataSummary = "";
    for (const [toolName, toolResult] of Object.entries(data)) {
        // Simple header for the tool
        const cleanToolName = toolName.split('.').pop() || toolName; // e.g., read_emails
        dataSummary += `--- ${cleanToolName.replace(/_/g, ' ').toUpperCase()} ---\n`;

        if (toolResult && typeof toolResult === 'object' && toolResult.error) {
            dataSummary += `  Error fetching data: ${toolResult.error}\n`;
        } else if (typeof toolResult !== 'undefined' && toolResult !== null) {
            // Attempt to stringify, limit length if necessary
            try {
                let resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
                // Basic check for empty results
                if (resultStr === '[]' || resultStr === '{}' || resultStr.trim() === '' || resultStr.toLowerCase() === 'null' ) {
                     resultStr = "No relevant information found.";
                }
                // Limit length per tool to avoid overly long prompts
                if (resultStr.length > 1000) {
                    resultStr = resultStr.substring(0, 997) + "... (truncated)";
                }
                dataSummary += `  ${resultStr}\n`;
            } catch (e) {
                dataSummary += `  Could not process result.\n`;
            }
        } else {
             dataSummary += `  No data received or data is null/undefined.\n`;
        }
        dataSummary += "\n";
    }


    const prompt = `You are an assistant generating a concise, friendly "morning brief" for user ID ${userId}.
Synthesize the following information into a helpful summary for their day.
Focus on actionable items, important updates (like unread important emails, today's events), and key info (like weather).
Be conversational and start with a greeting. If there were errors fetching data for a service, mention it briefly and gracefully. Keep the overall brief concise.

Collected Data:
${dataSummary}
Generate the morning brief now:`;

    try {
        // Use the appropriate method from openaiService (e.g., generateText, createChatCompletion)
        console.log("Sending prompt to OpenAI service...");
        const briefContent = await openaiService.generateText(prompt); // Adjust function call if needed
        console.log(`Successfully generated brief for user ${userId}`);
        return briefContent || "I couldn't generate the brief content at this moment.";
    } catch (error) {
        console.error(`Error generating brief using OpenAI for user ${userId}:`, error);
        throw new Error('Failed to generate brief summary via OpenAI.');
    }
  }

  /**
   * Orchestrates brief creation: gathers data, generates content, and stores it.
   * @param {string} userId - The ID of the user.
   * @param {string} type - The type of brief (e.g., 'morning', 'manual').
   * @param {Array} toolConfigs - Specific tool configurations for this brief type.
   * @returns {Promise<object|null>} - The stored brief object or null on failure.
   */
  async createAndStoreBrief(userId, type = 'manual', toolConfigs) {
    console.log(`Creating '${type}' brief for user ${userId}`);
    try {
      if (!toolConfigs || toolConfigs.length === 0) {
          console.error(`No tool configurations provided for brief type '${type}'. Cannot proceed.`);
          return null;
      }
      const data = await this.gatherBriefData(userId, toolConfigs);
      const content = await this.generateBriefFromData(userId, data);

      const { data: dbData, error } = await supabase
        .from('briefs')
        .insert([{ user_id: userId, content, type }])
        .select()
        .single(); // Expecting a single row back

      if (error) {
        console.error(`Error storing brief for user ${userId}:`, error);
        throw error;
      }

      console.log(`Stored ${type} brief for user ${userId}, ID: ${dbData.id}`);
      return dbData;
    } catch (error) {
      console.error(`Failed to create and store ${type} brief for user ${userId}:`, error.message);
      // Optionally, store an error state or log differently
      return null; // Return null to indicate failure
    }
  }

  /**
   * Fetches recent briefs for a user from the database.
   * @param {string} userId - The ID of the user.
   * @param {number} limit - Maximum number of briefs to retrieve.
   * @returns {Promise<Array>} - An array of brief objects.
   */
  async getBriefHistory(userId, limit = 10) {
    console.log(`Fetching brief history for user ${userId}, limit ${limit}`);
    const { data, error } = await supabase
      .from('briefs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`Error fetching brief history for user ${userId}:`, error);
      throw error;
    }
    return data || [];
  }

  // --- Scheduling ---

  /**
   * Fetches user IDs that should receive scheduled briefs.
   * Placeholder implementation - NEEDS ACTUAL IMPLEMENTATION.
   * @returns {Promise<Array<string>>} - Array of user IDs.
   */
  async getUsersForScheduledBriefs(briefType = 'morning') {
    // TODO: Implement actual logic to fetch users based on preferences or subscription tier
    // This might involve joining auth.users with a user_preferences table or similar.
    // Example structure for a preferences table:
    // CREATE TABLE user_preferences (
    //   user_id uuid REFERENCES auth.users(id) PRIMARY KEY,
    //   prefs jsonb
    // );
    // Query could be: select user_id from user_preferences where prefs->>'morning_brief_enabled' = 'true';

    console.warn("USING PLACEHOLDER USER FETCHING FOR SCHEDULED BRIEFS!");
    const testUserId = process.env.TEST_BRIEF_USER_ID; // Use an env var for testing
    if (testUserId) {
        console.log(`Using TEST_BRIEF_USER_ID: ${testUserId}`);
        return [testUserId];
    } else {
        console.warn("TEST_BRIEF_USER_ID environment variable not set. No users will be processed by scheduler unless real logic is added.");
        return [];
    }
    // Replace above with actual DB query logic
  }

  /**
   * Runs the scheduled task to generate briefs for relevant users.
   */
  async scheduleAllMorningBriefs() {
    console.log(`[${new Date().toISOString()}] Running scheduled job: Generating morning briefs...`);
    const userIds = await this.getUsersForScheduledBriefs('morning');

    if (!userIds || userIds.length === 0) {
        console.log("No users found eligible for scheduled morning briefs based on current fetching logic.");
        return;
    }

    console.log(`Found ${userIds.length} users scheduled for morning briefs.`);

    // Process users sequentially to avoid overwhelming services/rate limits.
    // Consider a queue or staggered execution for large numbers of users.
    for (const userId of userIds) {
      console.log(`[Scheduler] Processing morning brief for user: ${userId}`);
      try {
        // Pass the specific tool configuration for morning briefs
        await this.createAndStoreBrief(userId, 'morning', MORNING_BRIEF_TOOL_CONFIGS);
        console.log(`[Scheduler] Successfully processed morning brief for user: ${userId}`);
      } catch(error) {
        console.error(`[Scheduler] Failed to process morning brief for user ${userId}: ${error.message}`);
        // Log error but continue with next user
      }
    }

    console.log(`[${new Date().toISOString()}] Finished scheduled job for morning briefs.`);
  }

  /**
   * Initializes the cron scheduler.
   */
  startScheduler() {
    const schedule = process.env.BRIEF_SCHEDULE || '0 7 * * *'; // Default to 7 AM daily
    console.log(`Setting up briefs scheduler with cron expression: ${schedule}`);

    if (!cron.validate(schedule)) {
        console.error(`Invalid cron expression specified in BRIEF_SCHEDULE: "${schedule}". Scheduler not started.`);
        return;
    }

    cron.schedule(schedule, () => {
       // Add a try-catch block here too for safety
       try {
           this.scheduleAllMorningBriefs();
       } catch (error) {
           console.error("Error occurred during scheduled execution of scheduleAllMorningBriefs:", error);
       }
    }, {
      scheduled: true,
      timezone: process.env.TZ || "UTC", // Use system timezone or default to UTC
    });

    console.log(`Briefs scheduler started. Running according to schedule: ${schedule} in timezone ${process.env.TZ || "UTC"}`);
  }
}

module.exports = new BriefsService();