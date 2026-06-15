/**
 * utils/dtmf.js
 * DTMF keypad handling utilities for ElevenLabs voice agents.
 *
 * The DTMF_INSTRUCTIONS string is injected into every agent's system prompt
 * to prevent the LLM from treating keypad digits as "end-call" commands.
 */

const DTMF_INSTRUCTIONS = `

IMPORTANT — KEYPAD INPUT RULES (do NOT ignore):
- During this phone call the user may press keys on their dial pad.
- You will receive these as messages starting with "User pressed keypad: " followed by the digit.
- Treat this as a keypad press, NOT as a command to end the call or an error.
- NEVER hang up, end the conversation, or say goodbye solely because the user pressed a key.
- Acknowledge the key naturally (e.g. "Got it, you pressed 0. Let me help you with that.") and continue the conversation.`;

/**
 * Append DTMF instructions to a system prompt if not already present.
 * @param {string} prompt - Original system prompt
 * @returns {string} Prompt with DTMF instructions appended
 */
function appendDtmfInstructions(prompt = "") {
  if (prompt.includes("IMPORTANT — KEYPAD INPUT RULES")) return prompt;
  return prompt + DTMF_INSTRUCTIONS;
}

module.exports = { DTMF_INSTRUCTIONS, appendDtmfInstructions };
