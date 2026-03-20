require("dotenv").config();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const Agent = require("./models/Agent");
const PhoneNumber = require("./models/PhoneNumber");
const Conversation = require("./models/Conversation");
const McpServer = require("./models/McpServer");
const BatchCall = require("./models/BatchCall");
const User = require("./models/User");

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB for seeding");

  /* Clear all collections */
  await Promise.all([
    Agent.deleteMany({}),
    PhoneNumber.deleteMany({}),
    Conversation.deleteMany({}),
    McpServer.deleteMany({}),
    BatchCall.deleteMany({}),
    User.deleteMany({}),
  ]);
  console.log("🧹 Cleared all collections");

  /* ── Users ── */
  await User.create({
    name: "Callify Admin",
    email: "callify@gmail.com",
    password: "password123",
  });
  console.log("👤 Created default user");

  /* ── Agents ── */
  const agents = [
    {
      agent_id: uuidv4(),
      name: "Eric Support",
      tags: ["support", "english"],
      conversation_config: {
        asr: {}, turn: {}, tts: {},
        conversation: {
          system_prompt: "You are Eric, a friendly customer support agent for a SaaS platform. Help users with billing, account, and product questions.",
          first_message: "Hi, this is Eric. How can I help you today?",
          language: "en",
          voice_id: "ErXwobaYiN019PkySvjV",
        },
        language_presets: {}, agent: {},
      },
      created_at_unix_secs: Math.floor(Date.now() / 1000) - 86400 * 7,
    },
    {
      agent_id: uuidv4(),
      name: "Sales Bot Maya",
      tags: ["sales", "outbound"],
      conversation_config: {
        asr: {}, turn: {}, tts: {},
        conversation: {
          system_prompt: "You are Maya, a professional sales representative. Your goal is to schedule product demos and qualify leads.",
          first_message: "Hello! I'm Maya from Callify. I'd love to show you how our platform can help your business.",
          language: "en",
          voice_id: "21m00Tcm4TlvDq8ikWAM",
        },
        language_presets: {}, agent: {},
      },
      created_at_unix_secs: Math.floor(Date.now() / 1000) - 86400 * 3,
    },
    {
      agent_id: uuidv4(),
      name: "Billing Assistant",
      tags: ["billing", "refunds"],
      conversation_config: {
        asr: {}, turn: {}, tts: {},
        conversation: {
          system_prompt: "You handle billing inquiries, process refund requests, and explain subscription plans clearly.",
          first_message: "Hi there! I can help you with any billing questions. What do you need?",
          language: "en",
          voice_id: "EXAVITQu4vr4xnSDxMaL",
        },
        language_presets: {}, agent: {},
      },
      created_at_unix_secs: Math.floor(Date.now() / 1000) - 86400,
    },
    {
      agent_id: uuidv4(),
      name: "Technical Support",
      tags: ["tech", "troubleshooting"],
      conversation_config: {
        asr: {}, turn: {}, tts: {},
        conversation: {
          system_prompt: "You are a technical support agent. Help users debug API integrations, resolve voice cloning issues, and troubleshoot platform errors.",
          first_message: "Hey! I'm here to help with any technical issues. What's going on?",
          language: "en",
          voice_id: "TxGEqnHWrfWFTfGW9XjX",
        },
        language_presets: {}, agent: {},
      },
      created_at_unix_secs: Math.floor(Date.now() / 1000) - 86400 * 2,
    },
  ];
  await Agent.insertMany(agents);
  console.log(`🤖 Created ${agents.length} agents`);

  /* ── Phone Numbers ── */
  const phoneNumbers = [
    { phone_number_id: uuidv4(), phone_number: "+1-415-555-0100", label: "Sales Hotline", assigned_agent: { agent_id: agents[1].agent_id, agent_name: "Sales Bot Maya" } },
    { phone_number_id: uuidv4(), phone_number: "+1-415-555-0200", label: "Support Line", assigned_agent: { agent_id: agents[0].agent_id, agent_name: "Eric Support" } },
    { phone_number_id: uuidv4(), phone_number: "+1-415-555-0300", label: "Billing", assigned_agent: { agent_id: agents[2].agent_id, agent_name: "Billing Assistant" } },
  ];
  await PhoneNumber.insertMany(phoneNumbers);
  console.log(`📞 Created ${phoneNumbers.length} phone numbers`);

  /* ── Conversations (matches data.json format) ── */
  const conversations = [
    {
      id: "conv_02k3c9we08e1rb4khnehb9k1cs",
      date: new Date("2025-07-18T09:12:00.000Z"),
      agent: "agent",
      duration: "3:47",
      messages: 18,
      evaluation: "Successful",
      creditsCall: 1295,
      creditsLLM: 12,
      costPerMin: 0.0003,
      totalUSD: 0.0011,
      transcript: "Customer wanted to know how to download generated audio clips.",
      client: { phone: "+1-555-2468", name: "Sakura" },
      recordingUrl: "/recordings/call2.mp3",
      tags: ["download", "audio-clips"],
      turns: [
        { speaker: "agent", text: "Hi, this is Eric. How can I help?", time: "0:00" },
        { speaker: "user", text: "I can't find the download button after generating a clip.", time: "0:15" },
        { speaker: "agent", text: "Sure—click the three-dots menu next to the clip and choose Download.", time: "0:22" },
      ],
      clientOverrides: { language: "English" },
    },
    {
      id: "conv_03k4c7we08e1rb4khnehb9k1dt",
      date: new Date("2025-07-18T10:05:00.000Z"),
      agent: "agent",
      duration: "6:23",
      messages: 31,
      evaluation: "In Progress",
      creditsCall: 2147,
      creditsLLM: 23,
      costPerMin: 0.0003,
      totalUSD: 0.0019,
      transcript: "User asked about integrating voices via API and needed sample code.",
      client: { phone: "+1-555-3579", name: "Kakashi" },
      recordingUrl: "/recordings/call3.mp3",
      tags: ["API", "integration", "sample-code"],
      turns: [
        { speaker: "agent", text: "Hi, Eric here. What do you need help with?", time: "0:00" },
        { speaker: "user", text: "I want to use the API but I don't know where to start.", time: "0:18" },
        { speaker: "agent", text: "I can walk you through authentication and a simple curl example.", time: "0:25" },
      ],
      clientOverrides: { language: "English" },
    },
    {
      id: "conv_04k5c5we08e1rb4khnehb9k1eu",
      date: new Date("2025-07-18T11:22:00.000Z"),
      agent: "agent",
      duration: "2:15",
      messages: 11,
      evaluation: "Failed",
      creditsCall: 785,
      creditsLLM: 7,
      costPerMin: 0.0003,
      totalUSD: 0.0006,
      transcript: "Call dropped during explanation of voice cloning steps.",
      client: { phone: "+1-555-4680", name: "Hinata" },
      recordingUrl: "/recordings/call4.mp3",
      tags: ["voice-cloning", "dropped-call"],
      turns: [
        { speaker: "agent", text: "Hi! Ready to clone your voice today?", time: "0:00" },
        { speaker: "user", text: "Yes, but I'm on mobile—will that work?", time: "0:12" },
        { speaker: "agent", text: "Absolutely, first step—", time: "0:18" },
      ],
      clientOverrides: { language: "English" },
    },
    {
      id: "conv_05k6c3we08e1rb4khnehb9k1fv",
      date: new Date("2025-07-18T14:03:00.000Z"),
      agent: "agent",
      duration: "4:10",
      messages: 22,
      evaluation: "Successful",
      creditsCall: 1523,
      creditsLLM: 15,
      costPerMin: 0.0003,
      totalUSD: 0.0012,
      transcript: "Resolved billing confusion—customer thought credits expired monthly.",
      client: { phone: "+1-555-5791", name: "Shikamaru" },
      recordingUrl: "/recordings/call5.mp3",
      tags: ["billing", "credits", "expiration"],
      turns: [
        { speaker: "agent", text: "Hi, Eric here. How can I assist?", time: "0:00" },
        { speaker: "user", text: "Do my credits reset at the end of each month?", time: "0:21" },
        { speaker: "agent", text: "No, credits roll over as long as your subscription is active.", time: "0:28" },
      ],
      clientOverrides: { language: "English" },
    },
    {
      id: "conv_06k7c1we08e1rb4khnehb9k1gw",
      date: new Date("2025-07-18T15:45:00.000Z"),
      agent: "agent",
      duration: "7:02",
      messages: 37,
      evaluation: "Successful",
      creditsCall: 2488,
      creditsLLM: 26,
      costPerMin: 0.0003,
      totalUSD: 0.0021,
      transcript: "Walked customer through creating a custom voice from 30-second sample.",
      client: { phone: "+1-555-6802", name: "Rock Lee" },
      recordingUrl: "/recordings/call6.mp3",
      tags: ["custom-voice", "training"],
      turns: [
        { speaker: "agent", text: "Hello! Let's build your custom voice.", time: "0:00" },
        { speaker: "user", text: "I have a 30-second clip ready; what do I do next?", time: "0:20" },
        { speaker: "agent", text: "Great! Upload it under Voices › Add New › Instant Voice Clone.", time: "0:27" },
      ],
      clientOverrides: { language: "English" },
    },
  ];
  await Conversation.insertMany(conversations);
  console.log(`📝 Created ${conversations.length} conversations`);

  /* ── MCP Servers ── */
  const mcpServers = [
    {
      id: uuidv4(),
      config: {
        url: "https://mcp-tools.example.com/production",
        name: "Production MCP",
        approval_policy: "require_approval_all",
        transport: "SSE",
        description: "Main production MCP server for agent tooling",
      },
      metadata: { created_at: Math.floor(Date.now() / 1000) - 86400 * 5 },
      tools: [
        { name: "search", description: "Search the knowledge base for relevant information" },
        { name: "calendar", description: "Access and manage calendar events" },
        { name: "email", description: "Send emails to customers" },
      ],
    },
    {
      id: uuidv4(),
      config: {
        url: "https://mcp-staging.example.com",
        name: "Staging MCP",
        approval_policy: "auto_approved",
        transport: "SSE",
        description: "Staging environment MCP server for testing",
      },
      metadata: { created_at: Math.floor(Date.now() / 1000) - 86400 * 2 },
      tools: [
        { name: "debug_log", description: "Log debug information during conversations" },
      ],
    },
  ];
  await McpServer.insertMany(mcpServers);
  console.log(`🔧 Created ${mcpServers.length} MCP servers`);

  /* ── Batch Calls ── */
  const now = Math.floor(Date.now() / 1000);
  const batchCalls = [
    {
      id: uuidv4(),
      name: "Q3 Re-engagement Campaign",
      agent_id: agents[1].agent_id,
      agent_name: "Sales Bot Maya",
      status: "completed",
      total_calls_scheduled: 5,
      total_calls_dispatched: 5,
      scheduled_time_unix: null,
      created_at_unix: now - 86400 * 3,
      last_updated_at_unix: now - 86400 * 2,
      recipients: [
        { id: uuidv4(), phone_number: "+1-555-1001", status: "completed", created_at_unix: now - 86400 * 3, updated_at_unix: now - 86400 * 2, conversation_id: "conv_batch_01" },
        { id: uuidv4(), phone_number: "+1-555-1002", status: "completed", created_at_unix: now - 86400 * 3, updated_at_unix: now - 86400 * 2, conversation_id: "conv_batch_02" },
        { id: uuidv4(), phone_number: "+1-555-1003", status: "failed", created_at_unix: now - 86400 * 3, updated_at_unix: now - 86400 * 2, conversation_id: "conv_batch_03" },
        { id: uuidv4(), phone_number: "+1-555-1004", status: "completed", created_at_unix: now - 86400 * 3, updated_at_unix: now - 86400 * 2, conversation_id: "conv_batch_04" },
        { id: uuidv4(), phone_number: "+1-555-1005", status: "completed", created_at_unix: now - 86400 * 3, updated_at_unix: now - 86400 * 2, conversation_id: "conv_batch_05" },
      ],
    },
    {
      id: uuidv4(),
      name: "New Feature Announcement",
      agent_id: agents[0].agent_id,
      agent_name: "Eric Support",
      status: "pending",
      total_calls_scheduled: 3,
      total_calls_dispatched: 0,
      scheduled_time_unix: now + 86400,
      created_at_unix: now,
      last_updated_at_unix: now,
      recipients: [
        { id: uuidv4(), phone_number: "+1-555-2001", status: "pending", created_at_unix: now, updated_at_unix: now, conversation_id: "" },
        { id: uuidv4(), phone_number: "+1-555-2002", status: "pending", created_at_unix: now, updated_at_unix: now, conversation_id: "" },
        { id: uuidv4(), phone_number: "+1-555-2003", status: "pending", created_at_unix: now, updated_at_unix: now, conversation_id: "" },
      ],
    },
  ];
  await BatchCall.insertMany(batchCalls);
  console.log(`📋 Created ${batchCalls.length} batch calls`);

  console.log("\n🎉 Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
