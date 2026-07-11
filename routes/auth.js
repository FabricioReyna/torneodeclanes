const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const requireAuth = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
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
      user: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Error interno de autenticacion." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: { id: req.adminId, username: req.adminUser } });
});

module.exports = router;
