/**
 * config/elevenlabs.js
 * Centralised ElevenLabs API configuration and helpers
 */
const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/**
 * Get a signed WebSocket URL for ElevenLabs Conversational AI.
 * @param {string} agentId - ElevenLabs agent ID
 * @returns {Promise<string>} Signed WebSocket URL
 */
async function getSignedUrl(agentId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  const res = await fetch(
    `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { "xi-api-key": apiKey } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs signed URL error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.signed_url;
}

/**
 * Create a new ElevenLabs Conversational AI agent.
 * @param {object} params - Agent configuration
 * @returns {Promise<string>} ElevenLabs agent ID
 */
async function createAgent(params) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  const res = await fetch(`${ELEVENLABS_API}/convai/agents/create`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs create agent error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.agent_id;
}

/**
 * Update an existing ElevenLabs agent via PATCH.
 * @param {string} agentId
 * @param {object} updates
 */
async function updateAgent(agentId, updates) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  const res = await fetch(`${ELEVENLABS_API}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs update agent error (${res.status}): ${err}`);
  }
}

module.exports = { ELEVENLABS_API, getSignedUrl, createAgent, updateAgent };
