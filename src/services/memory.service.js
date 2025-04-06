const { supabase } = require('./supabase');
const embeddingService = require('./embedding.service');

/**
 * Service for managing the memory system
 */
class MemoryService {
  /**
   * Store a new memory entry
   * @param {Object} entry - Memory entry to store
   * @param {string} entry.user_id - User ID
   * @param {string} entry.content - Text content
   * @param {Object} entry.metadata - Additional metadata
   * @param {string} entry.source - Source of the memory (e.g., 'chat', 'email')
   * @param {Object} entry.context - Contextual information
   * @returns {Promise<Object>} - Stored memory entry
   */
  async storeMemory({ user_id, content, metadata = {}, source, context = {} }) {
    try {
      // Generate embedding for the content
      const embedding = await embeddingService.generateEmbedding(content);
      
      // Store in database
      const { data, error } = await supabase
        .from('memory_entries')
        .insert({
          user_id,
          content,
          embedding,
          metadata,
          source,
          context
        })
        .select();
      
      if (error) {
        console.error('Error storing memory:', error);
        throw error;
      }
      
      return data[0];
    } catch (error) {
      console.error('Error in storeMemory:', error);
      throw error;
    }
  }
  
  /**
   * Process and store a chat message as a memory
   * @param {Object} message - Chat message
   * @param {string} message.userId - User ID
   * @param {string} message.content - Message content
   * @param {string} message.role - Message role (user, assistant, system)
   * @param {string} message.chatId - Chat ID
   * @param {Object} message.contextData - Additional context data
   * @returns {Promise<Object>} - Stored memory entry
   */
  async processChatMessage(message) {
    try {
      // Skip system messages
      if (message.role === 'system') {
        return null;
      }
      
      // Create metadata
      const metadata = {
        type: 'chat_message',
        chatId: message.chatId,
        role: message.role
      };
      
      // Create context
      const context = {
        temporal: {
          timestamp: new Date().toISOString(),
          timezone: message.contextData?.timezone || 'UTC'
        },
        source: {
          service: 'chat',
          type: message.role === 'user' ? 'user_message' : 'assistant_message'
        }
      };
      
      // Add device info if available
      if (message.contextData?.device) {
        context.device = message.contextData.device;
      }
      
      // Add geospatial info if available
      if (message.contextData?.location) {
        context.geospatial = message.contextData.location;
      }
      
      // Store in memory system
      return await this.storeMemory({
        user_id: message.userId,
        content: message.content,
        metadata,
        source: 'chat',
        context
      });
    } catch (error) {
      console.error('Error processing chat message:', error);
      throw error;
    }
  }
  
  /**
   * Retrieve memories based on a query
   * @param {Object} params - Query parameters
   * @param {string} params.query - Query text
   * @param {string} params.userId - User ID
   * @param {Object} params.filters - Additional filters
   * @param {Object} params.filters.timeRange - Time range filter
   * @param {Date} params.filters.timeRange.start - Start time
   * @param {Date} params.filters.timeRange.end - End time
   * @param {string[]} params.filters.sources - Source filters
   * @param {Object} params.filters.contextFilters - Context filters
   * @param {number} params.limit - Maximum number of results
   * @returns {Promise<Array>} - Retrieved memories
   */
  async retrieveMemories({ query, userId, filters = {}, limit = 10 }) {
    try {
      // Generate embedding for query
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      // Start building the query
      let supabaseQuery = supabase
        .from('memory_entries')
        .select('*')
        .eq('user_id', userId)
        .order('embedding <=> $1', { ascending: true })
        .limit(limit);
      
      // Add time range filter if provided
      if (filters.timeRange) {
        if (filters.timeRange.start) {
          supabaseQuery = supabaseQuery.gte('created_at', filters.timeRange.start);
        }
        if (filters.timeRange.end) {
          supabaseQuery = supabaseQuery.lte('created_at', filters.timeRange.end);
        }
      }
      
      // Add source filter if provided
      if (filters.sources && filters.sources.length > 0) {
        supabaseQuery = supabaseQuery.in('source', filters.sources);
      }
      
      // Execute query with the embedding parameter
      const { data, error } = await supabaseQuery.bind('$1', queryEmbedding);
      
      if (error) {
        console.error('Error retrieving memories:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in retrieveMemories:', error);
      throw error;
    }
  }
  
  /**
   * Get all memories for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of results
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} - Retrieved memories
   */
  async getUserMemories(userId, { limit = 100, offset = 0 } = {}) {
    try {
      const { data, error } = await supabase
        .from('memory_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) {
        console.error('Error getting user memories:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in getUserMemories:', error);
      throw error;
    }
  }
  
  /**
   * Delete a memory entry
   * @param {string} id - Memory entry ID
   * @param {string} userId - User ID (for security)
   * @returns {Promise<void>}
   */
  async deleteMemory(id, userId) {
    try {
      const { error } = await supabase
        .from('memory_entries')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      
      if (error) {
        console.error('Error deleting memory:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in deleteMemory:', error);
      throw error;
    }
  }
  
  /**
   * Delete all memories for a user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async deleteAllUserMemories(userId) {
    try {
      const { error } = await supabase
        .from('memory_entries')
        .delete()
        .eq('user_id', userId);
      
      if (error) {
        console.error('Error deleting all user memories:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in deleteAllUserMemories:', error);
      throw error;
    }
  }
}

module.exports = new MemoryService();
