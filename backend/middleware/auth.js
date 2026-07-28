const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verifies the JWT, then loads the actual user from the database (with
// their role and company populated) and attaches it to req.user.
//
// We deliberately re-fetch from the database on every request rather than
// trusting only what's inside the token. That way, if HR deactivates
// someone or changes their role mid-session, it takes effect immediately -
// not just after their token expires.
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).populate("role").populate("company");

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Account not found or inactive" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = requireAuth;