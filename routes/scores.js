const express = require("express");
const path = require("path");

const Clan = require("../models/Clan");
const Score = require("../models/Score");
const ChatVote = require("../models/ChatVote");
const { EXPORT_FILE, writeScoresWorkbook } = require("../utils/scoresExcel");

const router = express.Router();

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

  return writeScoresWorkbook(votesWithClanName, leaderboard);
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

router.get("/leaderboard", async (req, res) => {
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

router.post("/chat-vote", async (req, res) => {
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

router.post("/vote", async (req, res) => {
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

    if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 10) {
      return res.status(400).json({ message: "El puntaje debe ser un numero entre 1 y 10. Se permiten decimales." });
    }

    const clan = await Clan.findById(clanId);
    if (!clan) {
      return res.status(404).json({ message: "Clan no encontrado para puntuar." });
    }

    const existingVote = await Score.findOne({ clanId: clan._id, judgeKey });

    const vote = await Score.findOneAndUpdate(
      { clanId: clan._id, judgeKey },
      {
        judgeName,
        judgeKey,
        clanId: clan._id,
        score: numericScore
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
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
      excelFile: path.basename(exportMeta.localPath),
      cloud: {
        cloudCopyPath: exportMeta.cloudCopyPath,
        cloudWebhookUrl: exportMeta.cloudWebhookUrl
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

router.post("/sync-sheets", async (req, res) => {
  try {
    const exportMeta = await refreshExcelExport();
    return res.json({
      message: "Sincronizacion ejecutada.",
      googleSheets: exportMeta.googleSheets
    });
  } catch (error) {
    return res.status(500).json({ message: "No se pudo sincronizar con Google Sheets." });
  }
});

router.get("/obs-board", async (req, res) => {
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

router.get("/excel", async (req, res) => {
  try {
    await refreshExcelExport();
    return res.download(EXPORT_FILE, "puntajes_clanes.xlsx");
  } catch (error) {
    return res.status(500).json({ message: "No se pudo generar el archivo Excel." });
  }
});

module.exports = router;
