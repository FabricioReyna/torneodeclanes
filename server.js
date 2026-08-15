const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const { buildApp } = require("./app");
const connectDB = require("./config/db");
const Admin = require("./models/Admin");

dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-render-fallback-secret-change-me";
  console.warn("Advertencia: JWT_SECRET no definido. Se usó un valor temporal para arrancar la app. Configurarlo en Render antes de producción.");
}

const app = buildApp({ serveStatic: true });
const PORT = process.env.PORT || 3000;

async function ensureAdminExists() {
  const username = (process.env.ADMIN_USER || "admin").trim().toLowerCase();
  const password = (process.env.ADMIN_PASS || "admin123").trim();

  if (password.length < 8) {
    throw new Error("ADMIN_PASS debe tener al menos 8 caracteres.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await Admin.findOneAndUpdate(
    { username },
    { username, passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`Admin listo: ${username}`);
}

async function startServer() {
  try {
    await connectDB();
    await ensureAdminExists();
    app.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("No se pudo iniciar el servidor:", error.message);
    process.exit(1);
  }
}

startServer();
