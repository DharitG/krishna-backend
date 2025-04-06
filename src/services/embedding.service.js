require('dotenv').config();
const axios = require('axios');

/**
 * Service for generating and managing text embeddings
 */
class EmbeddingService {
  constructor() {
    // Check if we're using Azure OpenAI or direct OpenAI
    this.useAzure = process.env.USE_AZURE_OPENAI === 'true';
    
    if (this.useAzure) {
      // Azure OpenAI configuration
      this.apiKey = process.env.AZURE_OPENAI_API_KEY;
      this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
      this.deploymentName = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME || 'text-embedding-large';
      this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
      this.isConfigured = !!(this.apiKey && this.endpoint && this.deploymentName);
      
      if (!this.isConfigured) {
        console.warn('Azure OpenAI embedding service not configured. Memory features will be limited.');
      }
      
      // Create Azure OpenAI client
      this.client = axios.create({
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        }
      });
    } else {
      // Direct OpenAI configuration
      this.apiKey = process.env.OPENAI_API_KEY;
      this.model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-large';
      this.isConfigured = !!this.apiKey;
      
      if (!this.isConfigured) {
        console.warn('OpenAI embedding service not configured. Memory features will be limited.');
      }
      
      // Create OpenAI client
      this.client = axios.create({
        baseURL: 'https://api.openai.com/v1',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
    }
  }

  /**
   * Generate embeddings for text using OpenAI's embedding model
   * @param {string|string[]} input - Text to embed (string or array of strings)
   * @returns {Promise<number[]|number[][]>} - Embedding vector(s)
   */
  async generateEmbedding(input) {
    if (!this.isConfigured) {
      throw new Error('Embedding service is not configured');
    }

    try {
      // Ensure input is an array
      const inputArray = Array.isArray(input) ? input : [input];
      
      if (this.useAzure) {
        // Azure OpenAI embedding request
        const normalizedEndpoint = this.endpoint.endsWith('/') 
          ? this.endpoint.slice(0, -1) 
          : this.endpoint;
        
        const apiUrl = `${normalizedEndpoint}/openai/deployments/${this.deploymentName}/embeddings?api-version=${this.apiVersion}`;
        
        const payload = {
          input: inputArray,
          dimensions: 1536 // Optional, can be removed if not needed
        };
        
        const response = await this.client.post(apiUrl, payload);
        
        // Extract embeddings from response
        const embeddings = response.data.data.map(item => item.embedding);
        
        // Return single embedding or array based on input
        return Array.isArray(input) ? embeddings : embeddings[0];
      } else {
        // Direct OpenAI embedding request
        const payload = {
          model: this.model,
          input: inputArray
        };
        
        const response = await this.client.post('/embeddings', payload);
        
        // Extract embeddings from response
        const embeddings = response.data.data.map(item => item.embedding);
        
        // Return single embedding or array based on input
        return Array.isArray(input) ? embeddings : embeddings[0];
      }
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }
  
  /**
   * Calculate cosine similarity between two vectors
   * @param {number[]} vecA - First vector
   * @param {number[]} vecB - Second vector
   * @returns {number} - Cosine similarity (between -1 and 1)
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
}

module.exports = new EmbeddingService();
