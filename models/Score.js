const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    judgeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    judgeKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 40
    },
    clanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clan",
      required: true,
      index: true
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    }
  },
  { timestamps: true }
);

scoreSchema.index({ clanId: 1, createdAt: -1 });
scoreSchema.index(
  { clanId: 1, judgeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { judgeKey: { $type: "string" } }
  }
);

module.exports = mongoose.model("Score", scoreSchema);
