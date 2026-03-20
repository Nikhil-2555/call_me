const router = require("express").Router();

/* GET /voices — static list of available voices */
const VOICES = [
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

router.get("/", (_req, res) => {
  res.json({ voices: VOICES });
});

module.exports = router;
