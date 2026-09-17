const jwt = require("jsonwebtoken");
const { query } = require("../database/dbpromise");

const validateAgent = async (req, res, next) => {
  try {
    const token = req.get("Authorization");
    if (!token) {
      return res.json({ msg: "No token found", logout: true });
    }

    // Verify JWT synchronously to avoid async-in-callback issue
    let decode;
    try {
      decode = jwt.verify(token.split(" ")[1], process.env.JWTKEY);
    } catch (err) {
      return res.json({ success: 0, msg: "Invalid token found", logout: true });
    }

    if (decode.role !== "agent") {
      return res.json({ success: 0, msg: "Unauthorized token", logout: true });
    }

    // DB lookups outside the JWT callback — errors are properly caught
    const getAgent = await query(
      `SELECT * FROM agents WHERE email = ? AND password = ?`,
      [decode.email, decode.password]
    );

    if (getAgent.length < 1) {
      return res.json({ success: false, msg: "Invalid token found", logout: true });
    }

    if (getAgent[0]?.is_active < 1) {
      return res.json({ msg: "You are an inactive agent.", logout: true, success: false });
    }

    const getOwner = await query(`SELECT * FROM user WHERE uid = ?`, [
      getAgent[0]?.owner_uid,
    ]);

    if (getOwner.length < 1) {
      return res.json({ msg: "Agent owner not found", success: false });
    }

    req.owner = getOwner[0];
    req.decode = decode;
    req.decode.userData = getAgent[0];
    next();
  } catch (err) {
    console.error("validateAgent error:", err);
    res.json({ msg: "server error", err: err.message });
  }
};

module.exports = validateAgent;
