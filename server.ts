import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { Client, GatewayIntentBits, Partials, ActivityType } from "discord.js";
import dotenv from "dotenv";
import { DiscordMessage, BotConfig, BotStatus, LogEntry, RealtimePayload } from "./src/types";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Resolve directories
let currentDir = "";
try {
  currentDir = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  currentDir = __dirname;
}

const DATA_DIR = path.join(currentDir, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const MESSAGES_PATH = path.join(DATA_DIR, "messages.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-Memory store
let messages: DiscordMessage[] = [];
let botConfig: BotConfig = {
  botToken: process.env.DISCORD_BOT_TOKEN || "",
  channelId: process.env.DISCORD_CHANNEL_ID || "",
};
let botStatus: BotStatus = {
  connected: false,
  status: "offline",
  botName: null,
  botAvatarUrl: null,
  error: null,
  monitoredChannel: null,
};
let systemLogs: LogEntry[] = [];

// Session state storage
const sessions = new Map<string, { username: string; role: "admin" | "mod" }>();

interface SseConnection {
  res: express.Response;
  isAdmin: boolean;
}
const sseConnections = new Set<SseConnection>();

// SSE Broadcast helper
function broadcast(payload: RealtimePayload, requireAdmin = false) {
  const payloadString = `data: ${JSON.stringify(payload)}\n\n`;
  sseConnections.forEach((conn) => {
    if (!requireAdmin || conn.isAdmin) {
      try {
        conn.res.write(payloadString);
      } catch (err) {
        console.error("SSE write failure:", err);
      }
    }
  });
}

// Log helper
function addLog(level: "info" | "warn" | "error", message: string) {
  const log: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  systemLogs.unshift(log);
  if (systemLogs.length > 100) systemLogs.pop();
  
  // Stream log immediately to admin clients
  broadcast({ type: "log", data: log }, true);
  console.log(`[${level.toUpperCase()}] ${log.timestamp} - ${message}`);
}

// Load persisted data
function loadPersistedData() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      botConfig = JSON.parse(data);
      addLog("info", "Bot configuration loaded from storage.");
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
    }
  } catch (error: any) {
    addLog("error", `Failed to load config: ${error.message}`);
  }

  try {
    if (fs.existsSync(MESSAGES_PATH)) {
      const data = fs.readFileSync(MESSAGES_PATH, "utf-8");
      messages = JSON.parse(data);
      addLog("info", `Loaded ${messages.length} messages from storage.`);
    } else {
      // Create lovely dummy seed messages so the board is immediately alive on first launch
      messages = [
        {
          id: "seed_msg_3",
          authorId: "123456789012345678",
          authorName: "Sarah_Explorer",
          authorTag: "Sarah_Explorer#4423",
          authorAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120",
          content: "Look at this incredible panoramic view from my hike today! Linking this Discord channel to our website is a complete game changer. It renders instantly! 🌲🏕️⛰️",
          attachments: [
            {
              id: "att_1",
              name: "yosemite_valley.jpg",
              url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000",
              contentType: "image/jpeg",
              size: 452091,
              width: 1000,
              height: 600
            }
          ],
          createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
          channelId: botConfig.channelId || "888888888888888888",
          channelName: "announcements"
        },
        {
          id: "seed_msg_2",
          authorId: "234567890123456789",
          authorName: "Aris_Concept",
          authorTag: "Aris_Concept#1001",
          authorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120",
          content: "The latest system wireframes and blueprint mockups are complete. Here is the schematic drawing we'll be discussing on next Monday's sync! Let's get all hands on deck.",
          attachments: [
            {
              id: "att_2",
              name: "system_architecture_draft.png",
              url: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=1000",
              contentType: "image/png",
              size: 894012,
              width: 1000,
              height: 650
            }
          ],
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          channelId: botConfig.channelId || "888888888888888888",
          channelName: "design-feedback"
        },
        {
          id: "seed_msg_1",
          authorId: "345678901234567890",
          authorName: "Marcus_TechLead",
          authorTag: "Marcus_TechLead#9999",
          authorAvatar: null,
          content: "Hey team! I have finalized the core server listening daemon. It handles connection interruptions gracefully, caches logs, and supports dynamic channel linking. Feel free to type away in Discord, everything should show up here real-time with zero-lag SSE streaming. Keep posting updates, articles, or memes!",
          attachments: [],
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
          channelId: botConfig.channelId || "888888888888888888",
          channelName: "general"
        }
      ];
      fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
      addLog("info", "Initialized default showcase messages.");
    }
  } catch (error: any) {
    addLog("error", `Failed to load messages: ${error.message}`);
  }
}

// Save helpers
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
  } catch (error: any) {
    addLog("error", `Failed to save config file: ${error.message}`);
  }
}

function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
  } catch (error: any) {
    addLog("error", `Failed to save messages file: ${error.message}`);
  }
}



// Discord Client Instance Holder
let discordClient: Client | null = null;

// Build helper for avatarUrl
function getDiscordAvatarUrl(author: any) {
  if (author.avatar) {
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`;
  }
  const disc = author.discriminator && author.discriminator !== "0" ? parseInt(author.discriminator) : 0;
  return `https://cdn.discordapp.com/embed/avatars/${(disc || parseInt(author.id.slice(-2)) || 0) % 5}.png`;
}

// Update bot status helper
function setStatus(status: BotStatus["status"], errorMsg: string | null = null) {
  botStatus.status = status;
  botStatus.connected = status === "online";
  botStatus.error = errorMsg;
  if (status !== "online") {
    botStatus.botName = null;
    botStatus.botAvatarUrl = null;
    botStatus.monitoredChannel = null;
  }
  
  // Broadcast update to admin front-end instantly
  broadcast({ type: "status", data: botStatus }, true);
}

// Initialize and login Discord Bot
async function startDiscordBot() {
  // Destroy existing client first if any is running
  if (discordClient) {
    addLog("info", "Disconnecting active Discord client...");
    try {
      discordClient.destroy();
    } catch (err: any) {
      addLog("error", `Exception during bot teardown: ${err.message}`);
    }
    discordClient = null;
  }

  const token = botConfig.botToken.trim();
  const channelId = botConfig.channelId.trim();

  if (!token) {
    addLog("warn", "No Discord Bot Token configured. Standing by in offline mode...");
    setStatus("offline");
    return;
  }

  addLog("info", "Starting Discord client connection flow...");
  setStatus("connecting");

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Channel, Partials.Message]
    });

    client.on("ready", async () => {
      addLog("info", `Discord Client successfully authenticated as: ${client.user?.tag}`);
      
      let verifiedChannelName = "General / Unknown";
      let verifiedGuildName = "Unknown Server";

      if (channelId) {
        addLog("info", `Fetching specified Discord channel with ID: ${channelId}...`);
        try {
          const channel = await client.channels.fetch(channelId);
          if (channel) {
            verifiedChannelName = (channel as any).name || "Text Channel";
            verifiedGuildName = (channel as any).guild?.name || "Guild Server";
            addLog("info", `Monitored channel verified! Found '#${verifiedChannelName}' on server '${verifiedGuildName}'.`);
            
            botStatus.monitoredChannel = {
              id: channelId,
              name: verifiedChannelName,
              guildName: verifiedGuildName,
            };

            // Set presence to show channel oversight
            client.user?.setPresence({
              activities: [{ name: `#${verifiedChannelName}`, type: ActivityType.Watching }],
              status: "online",
            });
          } else {
            throw new Error("Channel handle was null after resolution");
          }
        } catch (fetchError: any) {
          const warnMsg = `Could not find or load channel ID ${channelId}: ${fetchError.message}. The bot is connected but may not receive messages from this channel. Ensure the bot has permissions to view the channel.`;
          addLog("warn", warnMsg);
          botStatus.monitoredChannel = {
            id: channelId,
            name: "Unreachable / Missing Permissions",
            guildName: "Unknown Guild",
          };
        }
      } else {
        addLog("warn", "No channel ID provided. Bot is connected but stands idle.");
      }

      botStatus.botName = client.user?.username || "Discord Sync Bot";
      botStatus.botAvatarUrl = client.user ? getDiscordAvatarUrl(client.user) : null;
      setStatus("online");
    });

    client.on("messageCreate", async (message) => {
      // Skip own messages to avoid feed feedback loops
      if (message.author.id === client.user?.id) return;

      // Filter for target channel ID
      if (channelId && message.channelId === channelId) {
        addLog("info", `Intercepted new message from @${message.author.username} in #${(message.channel as any).name || "linked-channel"}`);

        const rawAttachments = Array.from(message.attachments.values());
        const mappedAttachments = rawAttachments.map((att) => ({
          id: att.id,
          name: att.name,
          url: att.url,
          contentType: att.contentType || null,
          size: att.size,
          width: att.width || undefined,
          height: att.height || undefined,
        }));

        const newMsg: DiscordMessage = {
          id: message.id,
          authorId: message.author.id,
          authorName: message.author.globalName || message.author.username,
          authorTag: message.author.tag,
          authorAvatar: getDiscordAvatarUrl(message.author),
          content: message.content || "",
          attachments: mappedAttachments,
          createdAt: message.createdAt.toISOString(),
          channelId: message.channelId,
          channelName: (message.channel as any).name || "announcements",
        };

        // Insert at beginning
        messages.unshift(newMsg);
        if (messages.length > 200) {
          messages = messages.slice(0, 200);
        }
        
        saveMessages();
        broadcast({ type: "message", data: newMsg });
      }
    });

    client.on("error", (err: any) => {
      addLog("error", `Fatal socket error reported by Discord Gateway: ${err.message}`);
      setStatus("error", err.message);
    });

    client.on("shardError", (err: any) => {
      addLog("error", `Gateway connection issue (ShardError): ${err.message}`);
    });

    // Handle invalid token / connection failure
    discordClient = client;
    await client.login(token);

  } catch (error: any) {
    addLog("error", `Bot login thread crashed: ${error.message}`);
    setStatus("error", error.message || "Failed to log in. Please check your token.");
    discordClient = null;
  }
}

// Load data first
loadPersistedData();

// Parse json structures with 60mb limit to handle POV media files (images, audio, videos)
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ limit: "60mb", extended: true }));

// Serve uploaded media files publicly
app.use("/uploads", express.static(UPLOADS_DIR));

// Configured credentials list
const USERS: { username: string; password: string; role: "admin" | "mod" }[] = [
  { username: "Mrz", password: "mrz001", role: "admin" },
  { username: "mrzadmin", password: "adminmrz123", role: "admin" },
  { username: "mrzmod", password: "modmrz321", role: "mod" }
];

// Admin/Moderator Authorization Middleware
function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers["x-admin-token"] || 
                req.query.token || 
                req.body?.token || 
                (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);
  if (token && typeof token === "string" && sessions.has(token)) {
    next();
  } else {
    addLog("warn", `Unauthorized access attempt to ${req.originalUrl} - Method: ${req.method}, Token Present: ${!!token}`);
    res.status(401).json({ error: "Unauthorized access" });
  }
}

// Strict Full-Administration authorization check - only "mrzadmin" has full admin clearance
function requireFullAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers["x-admin-token"] || 
                req.query.token || 
                req.body?.token || 
                (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);
  if (token && typeof token === "string" && sessions.has(token)) {
    const sessionInfo = sessions.get(token);
    if (sessionInfo && sessionInfo.username?.toLowerCase() === "mrzadmin") {
      return next();
    }
    addLog("warn", `Forbidden administration action attempt on ${req.originalUrl} by ${sessionInfo?.username || "unknown"}`);
  } else {
    addLog("warn", `Unauthorized full-admin access attempt on ${req.originalUrl} - Method: ${req.method}, Token Present: ${!!token}`);
  }
  res.status(403).json({ error: "Forbidden: Full administration credentials required" });
}

// Open / Public Endpoints
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

// Auth Administration Endpoints
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = typeof username === "string" ? username.trim() : "";
  const cleanPassword = typeof password === "string" ? password.trim() : "";
  
  const matchedUser = USERS.find(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password === cleanPassword
  );

  if (matchedUser) {
    const sessionToken = "session_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    sessions.set(sessionToken, { username: matchedUser.username, role: matchedUser.role });
    addLog("info", `Login success: ${matchedUser.username} authenticated as role '${matchedUser.role}'.`);
    res.json({ 
      success: true, 
      token: sessionToken, 
      username: matchedUser.username, 
      role: matchedUser.role 
    });
  } else {
    addLog("warn", `Failed login attempt for user: '${username}'`);
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/logout", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token && typeof token === "string") {
    sessions.delete(token);
    addLog("info", "User session closed.");
  }
  res.json({ success: true });
});

app.get("/api/verify-token", (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (token && typeof token === "string" && sessions.has(token)) {
    const info = sessions.get(token);
    res.json({ success: true, username: info?.username, role: info?.role });
  } else {
    res.json({ success: false });
  }
});

// Protected Information, Config, and Controls Endpoints (Require full Admin role)
app.get("/api/config", requireFullAdmin, (req, res) => {
  // Return masked config for security
  const maskedToken = botConfig.botToken 
    ? botConfig.botToken.substring(0, 12) + "•".repeat(Math.max(10, botConfig.botToken.length - 12))
    : "";
  res.json({
    botToken: maskedToken,
    hasToken: !!botConfig.botToken,
    channelId: botConfig.channelId,
  });
});

app.post("/api/config", requireFullAdmin, async (req, res) => {
  const { botToken, channelId } = req.body;

  let updated = false;
  if (channelId !== undefined) {
    botConfig.channelId = channelId.trim();
    updated = true;
  }

  if (botToken !== undefined && botToken.trim() !== "") {
    // Check if they updated a masked mock token or clean new text
    const cleanToken = botToken.trim();
    if (!cleanToken.includes("•")) {
      botConfig.botToken = cleanToken;
      updated = true;
    }
  } else if (botToken === "") {
    botConfig.botToken = "";
    updated = true;
  }

  if (updated) {
    saveConfig();
    addLog("info", `Configuration saved. Linking channel ${botConfig.channelId || "<none>"}`);
    // Async restart bot trigger
    startDiscordBot().catch((e) => {
      addLog("error", `Async connection trigger failed: ${e.message}`);
    });
  }

  res.json({ success: true, config: { channelId: botConfig.channelId, hasToken: !!botConfig.botToken } });
});

app.get("/api/status", requireFullAdmin, (req, res) => {
  res.json(botStatus);
});

app.get("/api/logs", requireFullAdmin, (req, res) => {
  res.json(systemLogs);
});

app.post("/api/clear", requireFullAdmin, (req, res) => {
  messages = [];
  saveMessages();
  broadcast({ type: "messages_init", data: [] });
  addLog("info", "Board message list was cleared by user command.");
  res.json({ success: true });
});

// File upload handler - converts base64 payload to static container asset
app.post("/api/upload", authenticateAdmin, (req, res) => {
  const { fileName, fileType, data } = req.body;
  if (!fileName || !data) {
    return res.status(400).json({ error: "Missing uploaded file stream details" });
  }

  try {
    const base64Clean = data.includes(";base64,") ? data.split(";base64,")[1] : data;
    const buffer = Buffer.from(base64Clean, "base64");
    
    const ext = path.extname(fileName) || ".png";
    const filenameOnly = path.basename(fileName, ext).replace(/[^a-zA-Z0-9]/g, "_");
    const uniqueName = `${filenameOnly}_${Date.now()}${ext}`;
    
    const filePath = path.join(UPLOADS_DIR, uniqueName);
    fs.writeFileSync(filePath, buffer);
    
    const downloadUrl = `/uploads/${uniqueName}`;
    addLog("info", `File successfully uploaded statically -> ${uniqueName} (${buffer.length} bytes)`);
    res.json({ 
      success: true, 
      url: downloadUrl, 
      size: buffer.length, 
      name: fileName, 
      contentType: fileType 
    });
  } catch (err: any) {
    addLog("error", `File upload failed: ${err.message}`);
    res.status(500).json({ error: `Upload thread exception: ${err.message}` });
  }
});

// Large-file chunked uploader supporting uploads up to 3GB size safely without container RAM exhaustion
app.post("/api/upload-chunked", authenticateAdmin, (req, res) => {
  const { fileName, fileType, chunkIndex, totalChunks, uploadId, data } = req.body;
  
  if (!fileName || data === undefined || uploadId === undefined || chunkIndex === undefined || totalChunks === undefined) {
    return res.status(400).json({ error: "Missing chunk upload parameters" });
  }

  try {
    const base64Clean = data.includes(";base64,") ? data.split(";base64,")[1] : data;
    const buffer = Buffer.from(base64Clean, "base64");
    
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9]/g, "_");
    const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, "_");
    const tempFilePath = path.join(UPLOADS_DIR, `part_${safeUploadId}_${safeFileName}`);

    if (chunkIndex === 0) {
      fs.writeFileSync(tempFilePath, buffer);
    } else {
      fs.appendFileSync(tempFilePath, buffer);
    }

    if (chunkIndex === totalChunks - 1) {
      const ext = path.extname(fileName) || ".mp4";
      const filenameOnly = path.basename(safeFileName, ext).replace(/[^a-zA-Z0-9]/g, "_");
      const uniqueName = `${filenameOnly}_${Date.now()}${ext}`;
      const finalPath = path.join(UPLOADS_DIR, uniqueName);
      
      fs.renameSync(tempFilePath, finalPath);
      
      const downloadUrl = `/uploads/${uniqueName}`;
      const finalSize = fs.statSync(finalPath).size;
      addLog("info", `Chuncked file upload completed -> ${uniqueName} (${finalSize} bytes)`);
      
      res.json({
        success: true,
        completed: true,
        url: downloadUrl,
        size: finalSize,
        name: fileName,
        contentType: fileType
      });
    } else {
      res.json({
        success: true,
        completed: false,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} received`
      });
    }
  } catch (err: any) {
    addLog("error", `Chunk upload anomaly at index ${chunkIndex}: ${err.message}`);
    res.status(500).json({ error: `Chunk transfer thread crash: ${err.message}` });
  }
});

// Sends a real-time customized manual operator message to the gallery synced feed
app.post("/api/custom-message", authenticateAdmin, (req, res) => {
  const { authorName, authorTag, authorAvatar, content, attachments, customBoxColor, customGlow } = req.body;
  
  const token = (req.headers["x-admin-token"] || req.query.token) as string;
  const sessionInfo = sessions.get(token);
  const operatorName = sessionInfo ? sessionInfo.username : "Operator";

  const newMsg: DiscordMessage = {
    id: "user_msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    authorId: "operator_" + (sessionInfo?.username || "mod"),
    authorName: authorName ? authorName.trim() : "MRZ Admin",
    authorTag: authorTag ? authorTag.trim() : "MRZ#1234",
    authorAvatar: authorAvatar || "https://i.imgur.com/uL8SqeX.jpeg",
    content: content || "",
    attachments: attachments || [],
    createdAt: new Date().toISOString(),
    channelId: botConfig.channelId || "mrz-dispatch",
    channelName: "mrz-webpage-dispatch",
    customBoxColor: customBoxColor || "default",
    customGlow: !!customGlow
  };

  messages.unshift(newMsg);
  if (messages.length > 200) {
    messages = messages.slice(0, 200);
  }
  
  saveMessages();
  broadcast({ type: "message", data: newMsg });
  addLog("info", `Manual board broadcast posted by ${operatorName} as "${newMsg.authorName}"`);

  res.json({ success: true, message: newMsg });
});

// Delete message individually
app.delete("/api/messages/:id", authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const initialLength = messages.length;
  messages = messages.filter(m => m.id !== id);
  if (messages.length < initialLength) {
    saveMessages();
    broadcast({ type: "message_delete", data: id });
    addLog("info", `Moderated & deleted individual message reference [ID: ${id}]`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Message not found" });
  }
});

// Edit/update message individually (name, profile, timestamps, styling, content)
app.patch("/api/messages/:id", requireFullAdmin, (req, res) => {
  const { id } = req.params;
  const msgIndex = messages.findIndex(m => m.id === id);
  if (msgIndex !== -1) {
    const { token, ...fieldsToUpdate } = req.body;
    const updatedMsg = { ...messages[msgIndex], ...fieldsToUpdate };
    messages[msgIndex] = updatedMsg;
    saveMessages();
    broadcast({ type: "message_update", data: updatedMsg });
    addLog("info", `Moderated & updated individual message reference [ID: ${id}]`);
    res.json({ success: true, message: updatedMsg });
  } else {
    res.status(404).json({ error: "Message not found" });
  }
});

// Post a beautiful interactive simulated test message to let users play with the UI without an API token
app.post("/api/test-message", authenticateAdmin, (req, res) => {
  const { authorName, content, category, authorAvatar, authorTag } = req.body;
  
  const testUsers = [
    { name: "Dev_Emily", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120", tag: "Emily#1923" },
    { name: "Jake_Illustrator", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120", tag: "JakeArt#8893" },
    { name: "Anna_Marketing", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120", tag: "AnnaM#0011" },
  ];

  const matchedUser = testUsers.find(u => u.name === authorName);
  const selectedUser = matchedUser || {
    name: authorName || "Sync Bot",
    avatar: authorAvatar || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120",
    tag: authorTag || "SyncBot#0000"
  };

  const sampleAttachmentsMap: Record<string, typeof messages[0]["attachments"]> = {
    image: [
      {
        id: "test_att_" + Date.now(),
        name: "creative_layout.png",
        url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1000",
        contentType: "image/png",
        size: 512249,
        width: 1000,
        height: 600
      }
    ],
    nature: [
      {
        id: "test_att_" + Date.now(),
        name: "mountains.jpg",
        url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1000",
        contentType: "image/jpeg",
        size: 320145,
        width: 1000,
        height: 600
      }
    ]
  };

  const selectedAttachments = category ? (sampleAttachmentsMap[category] || []) : [];

  const newMsg: DiscordMessage = {
    id: "test_" + Date.now(),
    authorId: "9999999" + Math.floor(Math.random() * 1000000),
    authorName: selectedUser.name,
    authorTag: selectedUser.tag,
    authorAvatar: selectedUser.avatar,
    content: content || "Beep boop! This is a test message to prove the real-time syncing layout works perfectly. 🚀✨",
    attachments: selectedAttachments,
    createdAt: new Date().toISOString(),
    channelId: botConfig.channelId || "888888888888888888",
    channelName: "simulated-landing",
    isTest: true,
  };

  messages.unshift(newMsg);
  saveMessages();
  broadcast({ type: "message", data: newMsg });
  addLog("info", `Dispatched mock interactive post: dev simulation from @${selectedUser.name}`);

  res.json({ success: true, message: newMsg });
});

// Server-Sent Events stream routing
app.get("/api/stream", (req, res) => {
  const token = req.query.token as string;
  const isAdmin = !!(token && sessions.has(token));

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.write("\n");

  const connection: SseConnection = { res, isAdmin };
  sseConnections.add(connection);
  
  // Send active messages and logs for synchronization
  res.write(`data: ${JSON.stringify({ type: "messages_init", data: messages })}\n\n`);
  
  if (isAdmin) {
    res.write(`data: ${JSON.stringify({ type: "status", data: botStatus })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "log", data: { timestamp: new Date().toISOString(), level: "info", message: "Console stream connected with administrator privileges." } })}\n\n`);
  }

  addLog("info", `Web-client (${isAdmin ? "Admin" : "Viewer"}) connected to active stream. Total listening tabs: ${sseConnections.size}`);

  req.on("close", () => {
    sseConnections.delete(connection);
    addLog("info", `Web-client (${isAdmin ? "Admin" : "Viewer"}) closed connection. Remaining listening tabs: ${sseConnections.size}`);
  });
});

// Trigger dynamic bot instantiation if a token is present
if (botConfig.botToken) {
  startDiscordBot().catch((err) => {
    console.error("Startup Discord client failure:", err);
  });
}

// Setup Vite or production static assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    addLog("info", "Starting application in Sandbox Development environment...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    addLog("info", "Starting application in Production environment...");
    const distPath = path.join(currentDir, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    addLog("info", `Platform gateway server running on port: ${PORT}`);
  });
}

startServer();
