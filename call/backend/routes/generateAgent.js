const router = require("express").Router();

/* POST /api/generate-agent — proxy to Google Gemini for AI agent generation */
router.post("/generate-agent", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const systemPrompt = `You are an AI assistant that generates voice agent configurations based on user requests. 
    
Given a user's request, generate a JSON object with the following structure:
{
  "name": "Agent name (2-50 characters)",
  "language": "English" (default) or "Hindi" or "Spanish",
  "additionalLanguages": ["array", "of", "languages"] (optional, can be empty array),
  "firstMessage": "Greeting message the agent will say first",
  "systemPrompt": "Detailed system prompt for the agent's behavior and personality",
  "llmProvider": "gemini-2.0-flash" (default) or "gpt-4o-mini",
  "temperature": number between 0-2 (default 0.7),
  "maxTokens": number (default -1 for no limit),
  "enableLanguageDetection": boolean (default true),
  "tools": {
    "endCall": boolean (default false),
    "detectLanguage": boolean (default false),
    "skipTurn": boolean (default false),
    "transferToAgent": boolean (default false),
    "transferToNumber": boolean (default false),
    "playKeypadTouchTone": boolean (default false)
  }
}

Make the agent specialized for the user's specific request. For sales agents, enable relevant tools. For support agents, focus on helpful system prompts. Make the first message and system prompt specific to their use case.

User request: "${prompt}"

Respond ONLY with the JSON object, no additional text or markdown.`;

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GOOGLE_GEMINI_API_KEY is not set in .env" });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: [{ role: "user", content: systemPrompt }],
          temperature: 0.7,
        }),
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini API error response:", geminiData);
      return res.status(500).json({ error: "Gemini API request failed" });
    }

    const text = geminiData?.choices?.[0]?.message?.content;

    if (!text) {
      console.error("No response text from Gemini:", geminiData);
      return res.status(500).json({ error: "No content received from Gemini" });
    }

    /* Clean and parse JSON */
    let agentConfig;
    try {
      const cleanText = text.replace(/```json\n?|```\n?/g, "").trim();
      agentConfig = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      return res.status(500).json({ error: "Failed to generate valid agent configuration" });
    }

    /* Validate and sanitize config */
    const validatedConfig = {
      name: agentConfig.name || "AI Agent",
      language: agentConfig.language || "English",
      additionalLanguages: Array.isArray(agentConfig.additionalLanguages) ? agentConfig.additionalLanguages : [],
      firstMessage: agentConfig.firstMessage || "Hello! How can I help you today?",
      systemPrompt: agentConfig.systemPrompt || "You are a helpful AI assistant.",
      llmProvider: agentConfig.llmProvider || "gemini-2.0-flash",
      temperature: Math.max(0, Math.min(2, agentConfig.temperature || 0.7)),
      maxTokens: agentConfig.maxTokens || -1,
      enableLanguageDetection: agentConfig.enableLanguageDetection !== false,
      tools: {
        endCall: agentConfig.tools?.endCall || false,
        detectLanguage: agentConfig.tools?.detectLanguage || false,
        skipTurn: agentConfig.tools?.skipTurn || false,
        transferToAgent: agentConfig.tools?.transferToAgent || false,
        transferToNumber: agentConfig.tools?.transferToNumber || false,
        playKeypadTouchTone: agentConfig.tools?.playKeypadTouchTone || false,
      },
    };

    res.json(validatedConfig);
  } catch (error) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: "Failed to generate agent configuration" });
  }
});

module.exports = router;

