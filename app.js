const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const clanRoutes = require("./routes/clans");
const scoreRoutes = require("./routes/scores");

function buildApp(options = {}) {
  const { serveStatic = true } = options;

  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, app: "ARQUICRAFT API" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/clans", clanRoutes);
  app.use("/api/scores", scoreRoutes);

  if (serveStatic) {
    app.use(express.static(path.join(__dirname, "public")));

    app.get("/{*any}", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  return app;
}

module.exports = {
  buildApp
};
