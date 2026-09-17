const jwt = require("jsonwebtoken");
const { query } = require("../database/dbpromise");

const validateUser = async (req, res, next) => {
  try {
    const token = req.get("Authorization");
    if (!token) {
      return res.json({ msg: "No token found", token: token, logout: true });
    }

    jwt.verify(token.split(" ")[1], process.env.JWTKEY, (err, decode) => {
      if (err) {
        return res.json({
          success: 0,
          msg: "Invalid token found",
          token,
          logout: true,
        });
      }

      // Run DB lookup outside the jwt callback to catch errors properly
      query(
        `SELECT * FROM user WHERE email = ? and password = ? `,
        [decode.email, decode.password]
      )
        .then((getUser) => {
          if (getUser.length < 1) {
            return res.json({
              success: false,
              msg: "Invalid token found",
              token,
              logout: true,
            });
          }
          if (getUser[0].role === "user") {
            req.decode = decode;
            req.decode.userData = getUser[0];
            next();
          } else {
            return res.json({
              success: 0,
              msg: "Unauthorized token",
              token: token,
              logout: true,
            });
          }
        })
        .catch((dbErr) => {
          console.error("validateUser DB error:", dbErr);
          res.json({ msg: "server error", err: dbErr?.message });
        });
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};
module.exports = validateUser;
