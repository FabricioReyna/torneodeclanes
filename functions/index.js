const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const XLSX = require("xlsx");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const app = express();

app.use(cors());
app.use(express.json());

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 50
    }
  },
  { timestamps: true }
);

const clanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    tag: { type: String, required: true, trim: true, uppercase: true },
    leader: { type: String, required: true, trim: true },
    membersCount: { type: Number, required: true, min: 1 },
    phase: {
      type: String,
      enum: ["Fase 1", "La Escalada", "Gran Final"],
      default: "Fase 1"
    },
    paymentBond: { type: Boolean, default: false },
    notes: { type: String, default: "", trim: true, maxlength: 350 }
  },
  { timestamps: true }
);

const scoreSchema = new mongoose.Schema(
  {
    judgeName: { type: String, required: true, trim: true, maxlength: 40 },
    judgeKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    clanId: { type: mongoose.Schema.Types.ObjectId, ref: "Clan", required: true, index: true },
    score: { type: Number, required: true, min: 1, max: 10 }
  },
  { timestamps: true }
);

const chatVoteSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ["twitch", "youtube"],
      lowercase: true,
      trim: true
    },
    userKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 120
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    clanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clan",
      required: true,
      index: true
    },
    sourceMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    }
  },
  { timestamps: true }
);

clanSchema.index({ name: 1 }, { unique: true });
clanSchema.index({ tag: 1 }, { unique: true });
scoreSchema.index({ clanId: 1, createdAt: -1 });
scoreSchema.index(
  { clanId: 1, judgeKey: 1 },
  { unique: true, partialFilterExpression: { judgeKey: { $type: "string" } } }
);
chatVoteSchema.index({ platform: 1, userKey: 1 }, { unique: true });
chatVoteSchema.index({ clanId: 1, createdAt: -1 });

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
const Clan = mongoose.models.Clan || mongoose.model("Clan", clanSchema);
const Score = mongoose.models.Score || mongoose.model("Score", scoreSchema);
const ChatVote = mongoose.models.ChatVote || mongoose.model("ChatVote", chatVoteSchema);

let dbPromise;

function getExportFilePath() {
  const baseDir = process.env.K_SERVICE ? "/tmp" : path.join(__dirname, "exports");
  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, "puntajes_clanes.xlsx");
}

async function ensureDb() {
  if (dbPromise) {
    return dbPromise;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI no esta definido.");
  }

  dbPromise = mongoose.connect(mongoUri, {
    dbName: process.env.MONGO_DB_NAME || "arquicraft"
  });

  await dbPromise;
  logger.info("MongoDB conectado en Firebase Function");
}

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [, token] = authHeader.split(" ");
    if (!token) {
      return res.status(401).json({ message: "Token requerido." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = payload.sub;
    req.adminUser = payload.username;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalido o expirado." });
  }
}

function toLeaderboard(clans, scores, chatVotes = []) {
  const statsByClanId = new Map();
  const chatVotesByClanId = new Map();

  for (const score of scores) {
    const clanKey = String(score.clanId);
    const current = statsByClanId.get(clanKey) || { total: 0, count: 0 };
    current.total += Number(score.score) || 0;
    current.count += 1;
    statsByClanId.set(clanKey, current);
  }

  for (const chatVote of chatVotes) {
    const clanKey = String(chatVote.clanId);
    const current = chatVotesByClanId.get(clanKey) || 0;
    chatVotesByClanId.set(clanKey, current + 1);
  }

  return clans
    .map((clan) => {
      const key = String(clan._id);
      const stats = statsByClanId.get(key) || { total: 0, count: 0 };
      const chatCount = chatVotesByClanId.get(key) || 0;
      const judgeTotal = stats.total;
      const average = stats.count > 0 ? Number((stats.total / stats.count).toFixed(2)) : 0;
      return {
        clanId: clan._id,
        name: clan.name,
        tag: clan.tag,
        judgeTotalScore: judgeTotal,
        chatVotes: chatCount,
        totalScore: judgeTotal + chatCount,
        votesCount: stats.count,
        averageScore: average
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      if (b.judgeTotalScore !== a.judgeTotalScore) {
        return b.judgeTotalScore - a.judgeTotalScore;
      }
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      return a.name.localeCompare(b.name, "es");
    });
}

function normalizePlatform(value) {
  const platform = String(value || "")
    .trim()
    .toLowerCase();
  if (platform === "twitch" || platform === "youtube") {
    return platform;
  }
  return "";
}

function getVoteTargetFromMessage(message) {
  const text = String(message || "").trim();
  if (!text) {
    return "";
  }
  const match = text.match(/^!(?:voto|vote)\s+([^\s]+)/i);
  return match ? String(match[1]).trim().toUpperCase() : "";
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveClanFromChatPayload(payload) {
  const directClanId = String(payload.clanId || "").trim();
  const directTag = String(payload.clanTag || "").trim().toUpperCase();
  const directName = String(payload.clanName || "").trim();
  const targetTag = getVoteTargetFromMessage(payload.message);

  if (directClanId) {
    return Clan.findById(directClanId);
  }

  if (directTag) {
    return Clan.findOne({ tag: directTag });
  }

  if (targetTag) {
    return Clan.findOne({ tag: targetTag });
  }

  if (directName) {
    return Clan.findOne({ name: new RegExp(`^${escapeRegex(directName)}$`, "i") });
  }

  return null;
}

async function syncGoogleSheets(votes, leaderboardRows) {
  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";
  if (!webhook) {
    return { enabled: false, synced: false };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    votes: votes.map((vote) => ({
      fecha: vote.createdAt ? new Date(vote.createdAt).toISOString() : "",
      juez: vote.judgeName,
      clan: vote.clanName,
      score: vote.score
    })),
    ranking: leaderboardRows.map((row, index) => ({
      posicion: index + 1,
      clan: row.name,
      tag: row.tag,
      totalPuntos: row.totalScore,
      promedio: row.averageScore,
      votos: row.votesCount
    }))
  };

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("No se pudo sincronizar Google Sheets.");
  }

  const data = await response.json().catch(() => ({}));
  return {
    enabled: true,
    synced: true,
    sheetUrl: data.sheetUrl || data.url || null
  };
}

async function refreshExcelExport() {
  const [clans, votes, chatVotes] = await Promise.all([
    Clan.find({}, { name: 1, tag: 1 }).lean(),
    Score.find({}).sort({ createdAt: 1 }).lean(),
    ChatVote.find({}, { clanId: 1 }).lean()
  ]);

  const leaderboard = toLeaderboard(clans, votes, chatVotes);
  const clanNameById = new Map(clans.map((clan) => [String(clan._id), clan.name]));
  const votesWithClanName = votes.map((vote) => ({
    ...vote,
    clanName: clanNameById.get(String(vote.clanId)) || "Clan eliminado"
  }));

  const workbook = XLSX.utils.book_new();
  const votesRows = votesWithClanName.map((vote) => ({
    fecha: vote.createdAt ? new Date(vote.createdAt).toISOString() : "",
    juez: vote.judgeName,
    clan: vote.clanName,
    score: vote.score
  }));

  const rankingRows = leaderboard.map((row, index) => ({
    posicion: index + 1,
    clan: row.name,
    tag: row.tag,
    totalPuntos: row.totalScore,
    promedio: row.averageScore,
    votos: row.votesCount
  }));

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(votesRows), "Votos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rankingRows), "Ranking");

  const localPath = getExportFilePath();
  XLSX.writeFile(workbook, localPath);

  let googleSheets = { enabled: false, synced: false };
  const warnings = [];

  try {
    googleSheets = await syncGoogleSheets(votesWithClanName, leaderboard);
  } catch (error) {
    warnings.push("No se pudo sincronizar Google Sheets.");
    googleSheets = { enabled: true, synced: false };
  }

  return {
    localPath,
    googleSheets,
    warnings
  };
}

function buildObsJudgeBoard(scores) {
  const latestByJudge = new Map();
  for (const score of scores) {
    const judgeKey = String(score.judgeName || "").trim().toLowerCase();
    if (!judgeKey || latestByJudge.has(judgeKey)) {
      continue;
    }
    latestByJudge.set(judgeKey, score);
  }

  const judges = Array.from(latestByJudge.values())
    .slice(0, 3)
    .map((item) => ({
      judgeName: item.judgeName,
      score: item.score,
      skinUrl: `https://mc-heads.net/avatar/${encodeURIComponent(item.judgeName)}/96`,
      createdAt: item.createdAt
    }));

  while (judges.length < 3) {
    judges.push({
      judgeName: "Pendiente",
      score: 0,
      skinUrl: "https://mc-heads.net/avatar/Steve/96",
      createdAt: null
    });
  }

  const totalScore = judges.reduce((acc, judge) => acc + Number(judge.score || 0), 0);
  return { judges, totalScore };
}

app.get("/api/health", (req, res) => {
  return res.json({ ok: true, app: "ARQUICRAFT API (Firebase)" });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Usuario y contrasena son obligatorios." });
    }

    const normalizedUser = String(username).trim().toLowerCase();
    const admin = await Admin.findOne({ username: normalizedUser });
    if (!admin) {
      return res.status(401).json({ message: "Credenciales invalidas." });
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Credenciales invalidas." });
    }

    const token = jwt.sign(
      { sub: admin._id.toString(), username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({
      token,
      user: { id: admin._id, username: admin.username }
    });
  } catch (error) {
    return res.status(500).json({ message: "Error interno de autenticacion." });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ user: { id: req.adminId, username: req.adminUser } });
});

app.get("/api/clans/public", async (req, res) => {
  try {
    const clans = await Clan.find({}, { name: 1, tag: 1 }).sort({ name: 1 });
    return res.json(clans);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo listar clanes." });
  }
});

app.get("/api/clans", requireAuth, async (req, res) => {
  try {
    const clans = await Clan.find().sort({ createdAt: -1 });
    return res.json(clans);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo listar clanes." });
  }
});

app.post("/api/clans", requireAuth, async (req, res) => {
  try {
    const { name, tag, leader, membersCount, phase, paymentBond, notes } = req.body;
    if (!name || !tag || !leader || !membersCount) {
      return res.status(400).json({ message: "Faltan campos requeridos del clan." });
    }

    const clan = await Clan.create({
      name: String(name).trim(),
      tag: String(tag).trim().toUpperCase(),
      leader: String(leader).trim(),
      membersCount: Number(membersCount),
      phase,
      paymentBond: Boolean(paymentBond),
      notes: notes ? String(notes).trim() : ""
    });

    return res.status(201).json(clan);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "Nombre o tag ya existe." });
    }
    return res.status(500).json({ message: "No se pudo crear el clan." });
  }
});

app.patch("/api/clans/:id", requireAuth, async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.tag) {
      updateData.tag = String(updateData.tag).trim().toUpperCase();
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "membersCount")) {
      updateData.membersCount = Number(updateData.membersCount);
    }

    const updated = await Clan.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: "Clan no encontrado." });
    }

    return res.json(updated);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "Nombre o tag ya existe." });
    }
    return res.status(500).json({ message: "No se pudo actualizar el clan." });
  }
});

app.delete("/api/clans/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await Clan.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Clan no encontrado." });
    }
    return res.json({ message: "Clan eliminado." });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo eliminar el clan." });
  }
});

app.get("/api/scores/leaderboard", async (req, res) => {
  try {
    const [clans, scores, chatVotes] = await Promise.all([
      Clan.find({}, { name: 1, tag: 1 }).lean(),
      Score.find({}, { clanId: 1, score: 1 }).lean(),
      ChatVote.find({}, { clanId: 1 }).lean()
    ]);

    const ranking = toLeaderboard(clans, scores, chatVotes);
    return res.json({
      generatedAt: new Date().toISOString(),
      totalClans: ranking.length,
      topThree: ranking.slice(0, 3),
      ranking
    });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el ranking." });
  }
});

app.post("/api/scores/chat-vote", async (req, res) => {
  try {
    const configuredSecret = String(process.env.CHAT_VOTE_WEBHOOK_SECRET || "").trim();
    if (!configuredSecret) {
      return res.status(503).json({ message: "CHAT_VOTE_WEBHOOK_SECRET no configurado." });
    }

    const requestSecret = String(req.headers["x-chat-secret"] || "").trim();
    if (!requestSecret || requestSecret !== configuredSecret) {
      return res.status(401).json({ message: "Webhook de chat no autorizado." });
    }

    const platform = normalizePlatform(req.body.platform);
    if (!platform) {
      return res.status(400).json({ message: "Plataforma invalida. Usa twitch o youtube." });
    }

    const username = String(req.body.username || "").trim();
    const userId = String(req.body.userId || "").trim();
    const userKey = (userId || username).toLowerCase();

    if (!username || username.length < 2) {
      return res.status(400).json({ message: "Username invalido en el payload." });
    }

    if (!userKey) {
      return res.status(400).json({ message: "No se pudo identificar al usuario del chat." });
    }

    const clan = await resolveClanFromChatPayload(req.body);
    if (!clan) {
      return res.status(404).json({
        message: "No se encontro clan para el voto de chat.",
        help: "Envia clanId/clanTag o mensaje con formato !voto TAG"
      });
    }

    const existingVote = await ChatVote.findOne({ platform, userKey }).lean();

    const chatVote = await ChatVote.findOneAndUpdate(
      { platform, userKey },
      {
        platform,
        userKey,
        username,
        clanId: clan._id,
        sourceMessage: String(req.body.message || "").trim()
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    await refreshExcelExport();

    return res.status(existingVote ? 200 : 201).json({
      message: existingVote ? "Voto de chat actualizado." : "Voto de chat registrado.",
      vote: {
        id: chatVote._id,
        platform: chatVote.platform,
        username: chatVote.username,
        clanId: clan._id,
        clan: clan.name,
        updatedAt: chatVote.updatedAt
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "Conflicto de voto en chat. Reintenta." });
    }
    return res.status(500).json({ message: "No se pudo guardar el voto de chat." });
  }
});

app.post("/api/scores/vote", async (req, res) => {
  try {
    const judgeName = String(req.body.judgeName || "").trim();
    const judgeKey = judgeName.toLowerCase();
    const clanId = String(req.body.clanId || "").trim();
    const numericScore = Number(req.body.score);

    if (!judgeName || !clanId || !Number.isFinite(numericScore)) {
      return res.status(400).json({ message: "Faltan datos del puntaje." });
    }
    if (judgeName.length < 2) {
      return res.status(400).json({ message: "El nombre del juez es demasiado corto." });
    }
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 10) {
      return res.status(400).json({ message: "El puntaje debe ser un numero entero entre 1 y 10." });
    }

    const clan = await Clan.findById(clanId);
    if (!clan) {
      return res.status(404).json({ message: "Clan no encontrado para puntuar." });
    }

    const existingVote = await Score.findOne({ clanId: clan._id, judgeKey });

    const vote = await Score.findOneAndUpdate(
      { clanId: clan._id, judgeKey },
      { judgeName, judgeKey, clanId: clan._id, score: numericScore },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    const exportMeta = await refreshExcelExport();
    const wasUpdated = Boolean(existingVote);

    return res.status(wasUpdated ? 200 : 201).json({
      message: wasUpdated ? "Puntaje actualizado para este juez." : "Puntaje registrado.",
      vote: {
        id: vote._id,
        judgeName: vote.judgeName,
        clan: clan.name,
        score: vote.score,
        createdAt: vote.createdAt
      },
      googleSheets: exportMeta.googleSheets,
      warnings: exportMeta.warnings || []
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "Conflicto de voto. Reintenta en unos segundos." });
    }
    return res.status(500).json({ message: "No se pudo guardar el puntaje." });
  }
});

app.post("/api/scores/sync-sheets", async (req, res) => {
  try {
    const exportMeta = await refreshExcelExport();
    return res.json({
      message: "Sincronizacion ejecutada.",
      googleSheets: exportMeta.googleSheets,
      warnings: exportMeta.warnings || []
    });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo sincronizar con Google Sheets." });
  }
});

app.get("/api/scores/obs-board", async (req, res) => {
  try {
    const clanId = String(req.query.clanId || "").trim();
    if (!clanId) {
      return res.status(400).json({ message: "Debes indicar clanId." });
    }

    const clan = await Clan.findById(clanId, { name: 1, tag: 1 }).lean();
    if (!clan) {
      return res.status(404).json({ message: "Clan no encontrado." });
    }

    const scores = await Score.find({ clanId }).sort({ createdAt: -1 }).lean();
    const board = buildObsJudgeBoard(scores);

    return res.json({
      generatedAt: new Date().toISOString(),
      clan,
      judges: board.judges,
      totalScore: board.totalScore
    });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo cargar el tablero OBS." });
  }
});

app.get("/api/scores/excel", async (req, res) => {
  try {
    const exportMeta = await refreshExcelExport();
    return res.download(exportMeta.localPath, "puntajes_clanes.xlsx");
  } catch (error) {
    return res.status(500).json({ message: "No se pudo generar el archivo Excel." });
  }
});

exports.api = onRequest(
  {
    region: "us-central1",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB"
  },
  async (req, res) => {
    try {
      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET no esta definido.");
      }
      await ensureDb();
      return app(req, res);
    } catch (error) {
      logger.error("Error en api function", error);
      return res.status(500).json({ message: "Error interno del servidor." });
    }
  }
);
