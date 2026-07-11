const mongoose = require("mongoose");

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI no esta definido en variables de entorno.");
  }

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGO_DB_NAME || "arquicraft"
  });

  console.log("MongoDB conectado correctamente");
}

module.exports = connectDB;
