const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const clanRoutes = require("./routes/clans");
const scoreRoutes = require("./routes/scores");
const requireAuth = require("./middleware/auth");

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(10, Math.max(0, Math.round(numeric)));
}

function buildApp(options = {}) {
  const { serveStatic = true } = options;

  const app = express();
  const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8888",
    "http://127.0.0.1:8888",
    process.env.FRONTEND_URL,
    process.env.NETLIFY_URL,
    process.env.RENDER_EXTERNAL_URL
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".netlify.app") || origin.endsWith(".onrender.com")) {
          callback(null, true);
          return;
        }

        callback(null, true);
      }
    })
  );
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, app: "ARQUICRAFT API" });
  });

  app.post("/api/admin/ranking", requireAuth, async (req, res) => {
    try {
      const input = Array.isArray(req.body?.clans) ? req.body.clans : [];
      if (!input.length) {
        return res.status(400).json({ message: "No hay clanes para guardar." });
      }

      const normalized = input.map((clan) => {
        const name = String(clan?.name || "Clan sin nombre").trim();
        return {
          name,
          boantek: clampScore(clan?.boantek ?? 0),
          daviale: clampScore(clan?.daviale ?? 0),
          vegettagaymer: clampScore(clan?.vegettagaymer ?? 0)
        };
      });

      const filePath = path.join(__dirname, "public", "clanes-final.json");
      fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

      return res.json({ ok: true, clans: normalized });
    } catch (error) {
      return res.status(500).json({ message: "No se pudo guardar el ranking." });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/clans", clanRoutes);
  app.use("/api/scores", scoreRoutes);

  if (serveStatic) {
    app.get("/login", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "login.html"));
    });

    app.get("/admin", (req, res) => {
      res.redirect("/login");
    });

    app.get("/admin.html", (req, res) => {
      res.redirect("/login");
    });

    app.use(express.static(path.join(__dirname, "public")));

    app.get(["/", "/index.html"], (req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });

    app.get(/^\/(?!api|login|admin(?:\.html)?$).*/, (req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  return app;
}

module.exports = {
  buildApp
};
