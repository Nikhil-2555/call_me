const router = require("express").Router();

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

/* Static fallback voices (used if ElevenLabs API is unavailable) */
const FALLBACK_VOICES = [
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "premade", labels: { accent: "American", age: "young", gender: "female" } },
  { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", category: "premade", labels: { accent: "American", age: "young", gender: "female" } },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", category: "premade", labels: { accent: "American", age: "young", gender: "female" } },
  { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", category: "premade", labels: { accent: "American", age: "young", gender: "male" } },
  { voice_id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", category: "premade", labels: { accent: "American", age: "young", gender: "female" } },
  { voice_id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", category: "premade", labels: { accent: "American", age: "young", gender: "male" } },
  { voice_id: "VR6AewLTigWG4xSOukaG", name: "Arnold", category: "premade", labels: { accent: "American", age: "middle-aged", gender: "male" } },
  { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade", labels: { accent: "American", age: "middle-aged", gender: "male" } },
  { voice_id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", category: "premade", labels: { accent: "American", age: "young", gender: "male" } },
  { voice_id: "jBpfuIE2acCO8z3wKNLl", name: "Gigi", category: "premade", labels: { accent: "American", age: "young", gender: "female" } },
];

/* GET /voices — fetch voices from ElevenLabs API, fallback to static list */
router.get("/", async (_req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return res.json({ voices: FALLBACK_VOICES });
  }

  try {
    const response = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": apiKey },
    });

    if (!response.ok) {
      console.error("ElevenLabs voices API error:", response.status);
      return res.json({ voices: FALLBACK_VOICES });
    }

    const data = await response.json();

    if (!Array.isArray(data.voices)) {
      // API key may lack voices_read permission — use fallback
      return res.json({ voices: FALLBACK_VOICES });
    }

    const voices = data.voices.map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category || "premade",
      labels: v.labels || {},
      preview_url: v.preview_url || "",
    }));

    res.json({ voices });
  } catch (err) {
    console.error("Failed to fetch ElevenLabs voices:", err.message);
    res.json({ voices: FALLBACK_VOICES });
  }
});

module.exports = router;
