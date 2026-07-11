const express = require("express");
const Clan = require("../models/Clan");
const requireAuth = require("../middleware/auth");

const router = express.Router();

router.get("/public", async (req, res) => {
  try {
    const clans = await Clan.find({}, { name: 1, tag: 1 }).sort({ name: 1 });
    return res.json(clans);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo listar clanes." });
  }
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const clans = await Clan.find().sort({ createdAt: -1 });
    return res.json(clans);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo listar clanes." });
  }
});

router.post("/", async (req, res) => {
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

router.patch("/:id", async (req, res) => {
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

router.delete("/:id", async (req, res) => {
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

module.exports = router;
