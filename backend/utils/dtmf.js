/**
 * utils/dtmf.js
 * DTMF keypad handling utilities for ElevenLabs voice agents.
 *
 * The DTMF_INSTRUCTIONS string is injected into every agent's system prompt
 * to prevent the LLM from treating keypad digits as "end-call" commands
 * and to ensure the agent ALWAYS responds — even after silence or noise.
 */

const DTMF_INSTRUCTIONS = `

CRITICAL — KEYPAD INPUT & CALL CONTINUITY RULES (MUST FOLLOW):
- During this phone call the user may press keys on their dial pad (DTMF tones).
- You may hear beeps, buzzing, clicking, or garbled audio — this is normal DTMF input. Do NOT treat it as an error.
- You will receive these as messages starting with "User pressed keypad: " followed by the digit.
- Treat this as a keypad press, NOT as a command to end the call or an error.
- NEVER hang up, end the conversation, or say goodbye because the user pressed a key.
- NEVER say "trial", "free trial", "session ended", or anything about account limitations.
- If you hear unusual tones, static, or silence, simply say "I'm here! How can I help you?" and continue.
- Acknowledge the key naturally (e.g. "Got it, you pressed 0. Let me help you with that.") and continue the conversation.
- You must ALWAYS keep the conversation going. Only end if the user explicitly says goodbye or asks to hang up.

CRITICAL — ALWAYS RESPOND RULES:
- You MUST always respond to the user with speech. NEVER stay silent.
- If the user says "hello", "hi", "hey", or any greeting, respond warmly and ask how you can help.
- If you receive audio but cannot understand it, say "I didn't quite catch that. Could you repeat that?"
- If there is a pause or silence, wait a moment then say "I'm still here. Feel free to ask me anything."
- If you hear noise, static, or interference, say "I heard some noise. I'm here — how can I help you?"
- NEVER ignore user input. ALWAYS generate a spoken response.
- If you are unsure what the user said, make your best guess and respond, or ask for clarification.
- Your #1 priority is to NEVER leave the user in silence. Always say something.`;

/**
 * Append DTMF instructions to a system prompt if not already present.
 * @param {string} prompt - Original system prompt
 * @returns {string} Prompt with DTMF instructions appended
 */
function appendDtmfInstructions(prompt = "") {
  if (prompt.includes("KEYPAD INPUT")) return prompt;
  return prompt + DTMF_INSTRUCTIONS;
}

module.exports = { DTMF_INSTRUCTIONS, appendDtmfInstructions };
