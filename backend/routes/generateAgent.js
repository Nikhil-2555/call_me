const router = require("express").Router();

/* POST /api/generate-agent — proxy to Groq for AI agent generation */
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
  "llmProvider": "llama-3.3-70b-versatile" (default) or "gpt-4o-mini",
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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GROQ_API_KEY is not set in .env" });
    }

    const groqResponse = await fetch(
      `https://api.groq.com/openai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: systemPrompt }],
          temperature: 0.7,
        }),
      }
    );

    const groqData = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error("Groq API error response:", groqData);
      return res.status(500).json({ error: "Groq API request failed" });
    }

    const text = groqData?.choices?.[0]?.message?.content;

    if (!text) {
      console.error("No response text from Groq:", groqData);
      return res.status(500).json({ error: "No content received from Groq" });
    }

    let agentConfig;
    try {
      const cleanText = text.replace(/```json\n?|```\n?/g, "").trim();
      agentConfig = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Failed to parse Groq response:", text);
      return res.status(500).json({ error: "Failed to generate valid agent configuration" });
    }

    /* Validate and sanitize config */
    const validatedConfig = {
      name: agentConfig.name || "AI Agent",
      language: agentConfig.language || "English",
      additionalLanguages: Array.isArray(agentConfig.additionalLanguages) ? agentConfig.additionalLanguages : [],
      firstMessage: agentConfig.firstMessage || "Hello! How can I help you today?",
      systemPrompt: agentConfig.systemPrompt || "You are a helpful AI assistant.",
      llmProvider: agentConfig.llmProvider || "llama-3.3-70b-versatile",
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
    console.error("Groq API error:", error);
    res.status(500).json({ error: "Failed to generate agent configuration" });
  }
});

module.exports = router;

