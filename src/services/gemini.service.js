// /Users/dharit/Desktop/ex/backend/src/services/gemini.service.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// CORRECTED MODEL NAME as specified by user
const MODEL_NAME = "gemini-2.0-flash"; // <<< CORRECTED LINE
const API_KEY = process.env.GEMINI_API_KEY;

// Basic safety settings - adjust as needed
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

class GeminiService {
  constructor() {
    if (!API_KEY) {
      console.warn("GEMINI_API_KEY not found in environment variables. GeminiService will not function.");
      this.genAI = null;
      this.model = null;
      this.isConfigured = false;
    } else {
      try {
        this.genAI = new GoogleGenerativeAI(API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: MODEL_NAME, safetySettings });
        this.isConfigured = true;
        console.log("GeminiService configured successfully with model:", MODEL_NAME);
      } catch (error) {
        console.error("Error initializing GeminiService:", error);
        this.genAI = null;
        this.model = null;
        this.isConfigured = false;
      }
    }
  }

  /**
   * Analyzes a conversation transcript and generates structured memory suggestions.
   * @param {string} transcript - The conversation transcript (e.g., alternating User: and AI: lines).
   * @param {string} userId - The user ID for context.
   * @returns {Promise<Array<object>>} - A promise resolving to an array of memory objects [{ content: string, category: string, importance_score: number }] or empty array on failure/no memories.
   */
  async generateMemorySuggestions(transcript, userId) {
    if (!this.isConfigured || !this.model) {
      console.error("GeminiService is not configured. Cannot generate memory suggestions.");
      return [];
    }

    // NOTE: This prompt is a starting point. It likely needs refinement based on
    // the quality of memories generated during testing. Consider adding few-shot examples.
    const prompt = `
      Analyze the following conversation transcript involving user ID ${userId}.
      Identify key pieces of information that should be remembered for future interactions.
      Focus on:
      - Explicit user preferences (likes, dislikes, requirements)
      - Important facts stated by the user (e.g., allergies, locations, relationships)
      - Key decisions made during the conversation
      - Future plans or commitments mentioned
      - Strong opinions or sentiments expressed

      For each piece of information identified as important, format it as a JSON object with the following keys:
      - "content": (string) A concise summary of the memory. Write it from a neutral, factual perspective.
      - "category": (string) Assign a category from this list: [Preference, Fact, Decision, Plan, Sentiment, Other].
      - "importance_score": (integer) Rate the importance of remembering this from 1 (low) to 10 (high).

      If multiple related facts form a single memory point, combine them concisely. Avoid remembering trivial details or information unlikely to be useful later.

      Output ONLY a valid JSON array containing these memory objects. If no important information is found, output an empty JSON array [].

      Conversation Transcript:
      ------------------------
      ${transcript}
      ------------------------

      JSON Output:
    `;

    try {
      console.log(`Sending transcript analysis request to Gemini for user ${userId}...`);
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      console.log(`Received raw response from Gemini for memory generation.`);
      // Attempt to parse the response as JSON
      let memories = [];
      try {
        // Clean the response text if Gemini adds backticks or "json" prefix
        // Use a more robust regex to extract JSON array, handling potential markdown/text before/after
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error("Could not find a JSON array structure in Gemini response:", responseText);
            return [];
        }
        const cleanedText = jsonMatch[0];
        memories = JSON.parse(cleanedText);

        if (!Array.isArray(memories)) {
          console.error("Gemini response for memories was not a JSON array:", cleanedText);
          return [];
        }
        // Optional: Validate structure of each memory object
        memories = memories.filter(mem => mem.content && mem.category && typeof mem.importance_score === 'number');
        console.log(`Successfully parsed ${memories.length} memory suggestions from Gemini.`);

      } catch (parseError) {
        console.error("Failed to parse Gemini response as JSON:", parseError);
        console.error("Raw Gemini Response Text:", responseText); // Log raw response on error
        return [];
      }

      return memories;

    } catch (error) {
      console.error("Error calling Gemini API for memory generation:", error);
      // Handle specific API errors if needed (e.g., rate limits, blocked content)
      if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
          console.error(`Gemini request blocked due to safety settings. Reason: ${error.response.promptFeedback.blockReason}`);
      } else if (error.message.includes('SAFETY')) {
          console.error("Gemini request potentially blocked due to safety settings (generic).");
      }
      return [];
    }
  }
}

module.exports = new GeminiService();