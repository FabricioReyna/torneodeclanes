const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const EXPORT_DIR = path.join(__dirname, "..", "exports");
const EXPORT_FILE = path.join(EXPORT_DIR, "puntajes_clanes.xlsx");
const CLOUD_EXCEL_DIR = process.env.CLOUD_EXCEL_DIR || "";
const CLOUD_EXCEL_WEBHOOK_URL = process.env.CLOUD_EXCEL_WEBHOOK_URL || "";
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";

function ensureExportDir() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function buildWorkbook(votes, leaderboardRows) {
  const workbook = XLSX.utils.book_new();

  const votesSheetRows = votes.map((vote) => ({
    fecha: vote.createdAt ? new Date(vote.createdAt).toISOString() : "",
    juez: vote.judgeName,
    clan: vote.clanName,
    score: vote.score
  }));

  const rankingSheetRows = leaderboardRows.map((row, index) => ({
    posicion: index + 1,
    clan: row.name,
    tag: row.tag,
    totalPuntos: row.totalScore,
    promedio: row.averageScore,
    votos: row.votesCount
  }));

  const votesSheet = XLSX.utils.json_to_sheet(votesSheetRows);
  const rankingSheet = XLSX.utils.json_to_sheet(rankingSheetRows);

  XLSX.utils.book_append_sheet(workbook, votesSheet, "Votos");
  XLSX.utils.book_append_sheet(workbook, rankingSheet, "Ranking");

  return workbook;
}

function copyToCloudFolder(localPath) {
  if (!CLOUD_EXCEL_DIR) {
    return null;
  }

  const cloudDir = path.resolve(CLOUD_EXCEL_DIR);
  fs.mkdirSync(cloudDir, { recursive: true });
  const cloudPath = path.join(cloudDir, path.basename(localPath));
  fs.copyFileSync(localPath, cloudPath);
  return cloudPath;
}

async function uploadToCloudWebhook(localPath) {
  if (!CLOUD_EXCEL_WEBHOOK_URL) {
    return null;
  }

  const buffer = fs.readFileSync(localPath);
  const fileBlob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const form = new FormData();
  form.append("file", fileBlob, path.basename(localPath));

  const response = await fetch(CLOUD_EXCEL_WEBHOOK_URL, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error("No se pudo subir el Excel al webhook de nube.");
  }

  const data = await response.json().catch(() => ({}));
  return data.url || data.link || null;
}

async function syncGoogleSheets(votes, leaderboardRows) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) {
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

  const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("No se pudo sincronizar con Google Sheets.");
  }

  const data = await response.json().catch(() => ({}));
  return {
    enabled: true,
    synced: true,
    sheetUrl: data.sheetUrl || data.url || null
  };
}

async function writeScoresWorkbook(votes, leaderboardRows) {
  ensureExportDir();
  const workbook = buildWorkbook(votes, leaderboardRows);
  XLSX.writeFile(workbook, EXPORT_FILE);

  let cloudCopyPath = null;
  let cloudWebhookUrl = null;
  let googleSheets = { enabled: false, synced: false };
  const warnings = [];

  try {
    cloudCopyPath = copyToCloudFolder(EXPORT_FILE);
  } catch (error) {
    warnings.push("No se pudo copiar el Excel a carpeta cloud.");
  }

  try {
    cloudWebhookUrl = await uploadToCloudWebhook(EXPORT_FILE);
  } catch (error) {
    warnings.push("No se pudo subir el Excel por webhook cloud.");
  }

  try {
    googleSheets = await syncGoogleSheets(votes, leaderboardRows);
  } catch (error) {
    googleSheets = { enabled: true, synced: false };
    warnings.push("No se pudo sincronizar Google Sheets.");
  }

  return {
    localPath: EXPORT_FILE,
    cloudCopyPath,
    cloudWebhookUrl,
    googleSheets,
    warnings
  };
}

module.exports = {
  EXPORT_FILE,
  writeScoresWorkbook
};
