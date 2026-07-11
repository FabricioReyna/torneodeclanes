const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No autorizado: token faltante." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = payload.sub;
    req.adminUser = payload.username;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalido o expirado." });
  }
}

module.exports = requireAuth;
