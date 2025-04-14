const { supabase } = require('./supabase');
const geminiService = require('./gemini.service');

class MemoryService {
  /**
   * Process a conversation transcript and store extracted memories
   * @param {string} userId - The user ID
   * @param {string} transcript - The conversation transcript
   * @returns {Promise<number>} - Number of memories stored
   */
  async processAndStoreMemories(userId, transcript) {
    try {
      console.log(`MemoryService: Processing transcript for user ${userId}`);

      // Use Gemini to extract memories from the transcript
      const memories = await geminiService.generateMemorySuggestions(transcript, userId);

      if (!memories || memories.length === 0) {
        console.log(`MemoryService: No memories extracted for user ${userId}`);
        return 0;
      }

      console.log(`MemoryService: Received ${memories.length} memory suggestions from Gemini for user ${userId}`);

      // Store each memory in the database
      let storedCount = 0;
      for (const memory of memories) {
        // Store in database
        const { error } = await supabase
          .from('user_memories')
          .insert({
            user_id: userId,
            content: memory.content,
            category: memory.category,
            importance_score: memory.importance_score,
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error(`MemoryService: Error storing memory for user ${userId}:`, error);
        } else {
          storedCount++;
        }
      }

      console.log(`MemoryService: Successfully stored ${storedCount} memories for user ${userId}`);
      return storedCount;
    } catch (error) {
      console.error(`MemoryService: Error processing memories for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Retrieve relevant memories for a user based on importance score and recency
   * @param {Object} options - Retrieval options
   * @param {string} options.userId - The user ID
   * @param {string} options.query - The query text (user's message)
   * @param {number} options.limit - Maximum number of memories to retrieve
   * @returns {Promise<Array>} - Array of relevant memories
   */
  async retrieveMemories({ userId, query, limit = 3 }) {
    try {
      console.log(`MemoryService: Retrieving memories for user ${userId} with query: "${query}"`);

      // Simple retrieval based on importance score and recency
      const { data, error } = await supabase
        .from('user_memories')
        .select('*')
        .eq('user_id', userId)
        .order('importance_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error(`MemoryService: Error retrieving memories for user ${userId}:`, error);
        return [];
      }

      console.log(`MemoryService: Retrieved ${data?.length || 0} memories for user ${userId}`);
      return data || [];
    } catch (error) {
      console.error(`MemoryService: Error in memory retrieval for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Enhanced memory retrieval using Gemini to select the most relevant memories
   * This implements the full LLM-to-LLM architecture where Gemini decides what to retrieve
   * @param {Object} options - Retrieval options
   * @param {string} options.userId - The user ID
   * @param {string} options.query - The query text (user's message)
   * @param {number} options.limit - Maximum number of memories to retrieve
   * @returns {Promise<Array>} - Array of relevant memories selected by Gemini
   */
  async retrieveMemoriesWithGemini({ userId, query, limit = 3 }) {
    try {
      console.log(`MemoryService: Using Gemini to retrieve memories for user ${userId} with query: "${query}"`);

      // First, get a larger set of candidate memories
      const { data, error } = await supabase
        .from('user_memories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10); // Get more candidates for Gemini to choose from

      if (error || !data || data.length === 0) {
        console.error(`MemoryService: Error or no memories found for user ${userId}:`, error);
        return [];
      }

      // Format memories for Gemini to analyze
      const memoriesText = data.map(mem => {
        return `Memory ID: ${mem.id}\nContent: ${mem.content}\nCategory: ${mem.category}\nImportance: ${mem.importance_score}`;
      }).join('\n\n');

      // Create a prompt for Gemini to select the most relevant memories
      const prompt = `
        You are a memory retrieval system. Your task is to select the most relevant memories
        for the current user query from the list of available memories below.

        User Query: "${query}"

        Available Memories:\n${memoriesText}

        Select the ${limit} most relevant memories for this query. Consider:
        1. Semantic relevance to the query
        2. Importance score
        3. How useful this information would be to answer the query

        Return ONLY a JSON array containing the IDs of the selected memories, like this: ["id1", "id2", "id3"]
        If no memories are relevant, return an empty array: []
      `;

      // Ask Gemini to select the most relevant memories
      const result = await geminiService.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      // Parse the response to get the selected memory IDs
      let selectedIds = [];
      try {
        // Extract JSON array from response
        const jsonMatch = responseText.match(/\[([^\]]*)\]/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          selectedIds = JSON.parse(jsonStr);
        }
      } catch (parseError) {
        console.error('MemoryService: Error parsing Gemini response:', parseError);
        console.log('Raw response:', responseText);
        // Fall back to importance-based retrieval
        return data.slice(0, limit);
      }

      // Filter the memories based on the selected IDs
      const selectedMemories = data.filter(mem => selectedIds.includes(mem.id));

      console.log(`MemoryService: Gemini selected ${selectedMemories.length} memories for user ${userId}`);
      return selectedMemories;
    } catch (error) {
      console.error(`MemoryService: Error in Gemini memory retrieval for user ${userId}:`, error);
      // Fall back to standard retrieval
      return this.retrieveMemories({ userId, query, limit });
    }
  }
}

module.exports = new MemoryService();
