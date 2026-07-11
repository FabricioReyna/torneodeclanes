const mongoose = require("mongoose");

const clanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    tag: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    leader: {
      type: String,
      required: true,
      trim: true
    },
    membersCount: {
      type: Number,
      required: true,
      min: 1
    },
    phase: {
      type: String,
      enum: ["Fase 1", "La Escalada", "Gran Final"],
      default: "Fase 1"
    },
    paymentBond: {
      type: Boolean,
      default: false
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 350
    }
  },
  { timestamps: true }
);

clanSchema.index({ name: 1 }, { unique: true });
clanSchema.index({ tag: 1 }, { unique: true });

module.exports = mongoose.model("Clan", clanSchema);
