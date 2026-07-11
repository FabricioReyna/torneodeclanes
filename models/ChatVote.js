const mongoose = require("mongoose");

const chatVoteSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ["twitch", "youtube"],
      lowercase: true,
      trim: true
    },
    userKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 120
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    clanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clan",
      required: true,
      index: true
    },
    sourceMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    }
  },
  { timestamps: true }
);

chatVoteSchema.index({ platform: 1, userKey: 1 }, { unique: true });
chatVoteSchema.index({ clanId: 1, createdAt: -1 });

module.exports = mongoose.model("ChatVote", chatVoteSchema);
