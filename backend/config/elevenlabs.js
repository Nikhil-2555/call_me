/**
 * config/elevenlabs.js
 * Centralised ElevenLabs API configuration and helpers.
 *
 * All API calls include:
 *   - Timeouts (prevents hanging forever on network issues)
 *   - Retry with exponential backoff (survives transient 5xx / network blips)
 *   - Detailed error logging so failures are easy to diagnose
 */
const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/** Default timeout for ElevenLabs API calls (10 seconds) */
const API_TIMEOUT_MS = 10000;

/** Max retries for transient errors */
const MAX_RETRIES = 2;

/**
 * Fetch wrapper with timeout and retry for ElevenLabs API.
 * Retries on 5xx, 429 (rate limit), and network errors.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {string} label - Human-readable label for logging
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, label = "ElevenLabs API") {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // AbortController for timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // If success or client error (4xx) — don't retry client errors
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Server error (5xx) or rate limit (429) — retry
      const errBody = await res.text().catch(() => "");
      lastError = new Error(`${label} error (${res.status}): ${errBody}`);
      console.warn(`⚠️  ${label} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${res.status}): ${errBody.slice(0, 200)}`);
    } catch (err) {
      // Network error or timeout
      if (err.name === "AbortError") {
        lastError = new Error(`${label} timed out after ${API_TIMEOUT_MS}ms`);
        console.warn(`⚠️  ${label} attempt ${attempt + 1}/${MAX_RETRIES + 1} timed out`);
      } else {
        lastError = err;
        console.warn(`⚠️  ${label} attempt ${attempt + 1}/${MAX_RETRIES + 1} network error: ${err.message}`);
      }
    }

    // Exponential backoff before retry: 500ms, 1500ms
    if (attempt < MAX_RETRIES) {
      const delay = 500 * Math.pow(3, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Get a signed WebSocket URL for ElevenLabs Conversational AI.
 * @param {string} agentId - ElevenLabs agent ID
 * @returns {Promise<string>} Signed WebSocket URL
 */
async function getSignedUrl(agentId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  const res = await fetchWithRetry(
    `${ELEVENLABS_API}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: { "xi-api-key": apiKey } },
    "getSignedUrl"
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs signed URL error (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!data.signed_url) {
    throw new Error(`ElevenLabs returned empty signed_url for agent ${agentId}`);
  }
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

  const res = await fetchWithRetry(
    `${ELEVENLABS_API}/convai/agents/create`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
    "createAgent"
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs create agent error (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!data.agent_id) {
    throw new Error("ElevenLabs create agent returned no agent_id");
  }
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

  const res = await fetchWithRetry(
    `${ELEVENLABS_API}/convai/agents/${agentId}`,
    {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
    "updateAgent"
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs update agent error (${res.status}): ${err}`);
  }
}

module.exports = { ELEVENLABS_API, getSignedUrl, createAgent, updateAgent };
