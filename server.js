const dotenv = require("dotenv");

const { buildApp } = require("./app");
const connectDB = require("./config/db");

dotenv.config();

const app = buildApp({ serveStatic: true });
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no esta definido en variables de entorno.");
    }

    await connectDB();
    app.listen(PORT, () => {
      console.log(`Servidor listo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("No se pudo iniciar el servidor:", error.message);
    process.exit(1);
  }
}

startServer();
