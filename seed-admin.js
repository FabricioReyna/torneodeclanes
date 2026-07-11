const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");
const Admin = require("./models/Admin");

dotenv.config();

async function seedAdmin() {
  try {
    const username = (process.env.ADMIN_USER || "admin").trim().toLowerCase();
    const password = (process.env.ADMIN_PASS || "admin123").trim();

    if (password.length < 8) {
      throw new Error("ADMIN_PASS debe tener al menos 8 caracteres.");
    }

    await connectDB();

    const passwordHash = await bcrypt.hash(password, 10);

    await Admin.findOneAndUpdate(
      { username },
      { username, passwordHash },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    console.log(`Admin preparado: ${username}`);
    process.exit(0);
  } catch (error) {
    console.error("Error al crear admin:", error.message);
    process.exit(1);
  }
}

seedAdmin();
