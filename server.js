const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const { buildApp } = require("./app");
const connectDB = require("./config/db");
const Admin = require("./models/Admin");

dotenv.config();

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
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no esta definido en variables de entorno.");
    }

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
