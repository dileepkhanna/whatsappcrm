const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const randomstring = require("randomstring");
const bcrypt = require("bcrypt");
const { sign } = require("jsonwebtoken");
const adminValidator = require("../middlewares/admin.js");
const {
  updateUserPlan,
  getFileExtension,
  sendEmail,
  isValidEmail,
  testMongoConnection,
} = require("../functions/function.js");
const moment = require("moment");
const { recoverEmail } = require("../emails/returnEmails.js");
const {
  sendFcmPushNotification,
} = require("../helper/addon/web-notification/webPush.js");

// Check if any admin exists
router.get("/check_exists", async (req, res) => {
  try {
    const admins = await query(`SELECT COUNT(*) as count FROM admin`, []);
    const exists = admins[0].count > 0;
    
    res.json({
      success: true,
      exists: exists,
    });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// Admin signup (only if no admin exists)
router.post("/signup", async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    if (!email || !name || !password) {
      return res.json({
        success: false,
        msg: "Please fill all the fields",
      });
    }
    
    if (!isValidEmail(email)) {
      return res.json({
        success: false,
        msg: "Please enter a valid email",
      });
    }
    
    // Check if any admin already exists
    const existingAdmins = await query(`SELECT COUNT(*) as count FROM admin`, []);
    if (existingAdmins[0].count > 0) {
      return res.json({
        success: false,
        msg: "Admin account already exists. Please login instead.",
      });
    }
    
    // Check if email is already taken
    const findEx = await query(`SELECT * FROM admin WHERE email = ?`, [email]);
    if (findEx.length > 0) {
      return res.json({
        success: false,
        msg: "This email is already registered",
      });
    }
    
    // Create admin account
    const haspass = await bcrypt.hash(password, 10);
    const uid = randomstring.generate();
    
    await query(
      `INSERT INTO admin (name, uid, email, password) VALUES (?,?,?,?)`,
      [name, uid, email, haspass]
    );
    
    // Generate token and auto-login
    const token = sign(
      {
        uid: uid,
        role: "admin",
        password: haspass,
        email: email,
      },
      process.env.JWTKEY,
      {}
    );
    
    res.json({
      success: true,
      token: token,
      msg: "Admin account created successfully",
    });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({
        success: false,
        msg: "Please fill email and password",
      });
    }
    // check for user
    const userFind = await query(`SELECT * FROM admin WHERE email = ?`, [
      email,
    ]);
    if (userFind.length < 1) {
      return res.json({ msg: "Invalid credentials found" });
    }

    const compare = await bcrypt.compare(password, userFind[0].password);
    if (!compare) {
      return res.json({ msg: "Invalid credentials" });
    } else {
      const token = sign(
        {
          uid: userFind[0].uid,
          role: "admin",
          password: userFind[0].password,
          email: userFind[0].email,
        },
        process.env.JWTKEY,
        {},
      );
      res.json({
        success: true,
        token,
      });
    }
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// add new plan
router.post("/add_plan", adminValidator, async (req, res) => {
  try {
    const {
      title,
      short_description,
      allow_tag,
      allow_note,
      allow_chatbot,
      contact_limit,
      allow_api,
      is_trial,
      price,
      price_strike,
      plan_duration_in_days,
      qr_account,
      wa_warmer,
      rest_api_qr,
      instagram_inbox,
      telegram_inbox,
      allow_wa_forms, // ✅ NEW
      allow_wa_call,
      allow_webhook,
      allow_chat_widget,
      allow_agents,
    } = req.body;

    if (!title || !short_description || !plan_duration_in_days) {
      return res.json({ success: false, msg: "Please fill details" });
    }

    await query(
      `INSERT INTO plan (title, short_description, allow_tag, allow_note, allow_chatbot, 
        contact_limit, allow_api, is_trial, price, price_strike, plan_duration_in_days, 
        qr_account, wa_warmer, rest_api_qr, instagram_inbox, telegram_inbox, allow_wa_forms,
        allow_wa_call, allow_webhook, allow_chat_widget, allow_agents) 
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, // ✅ 21 values
      [
        title,
        short_description,
        allow_tag ? 1 : 0,
        allow_note ? 1 : 0,
        allow_chatbot ? 1 : 0,
        parseInt(contact_limit || 0),
        allow_api ? 1 : 0,
        is_trial ? 1 : 0,
        is_trial ? 0 : price,
        price_strike,
        parseInt(plan_duration_in_days || 1),
        parseInt(qr_account) > 0 ? parseInt(qr_account) : 0,
        wa_warmer ? 1 : 0,
        rest_api_qr ? 1 : 0,
        instagram_inbox ? 1 : 0,
        telegram_inbox ? 1 : 0,
        allow_wa_forms ? 1 : 0, // ✅ NEW
        allow_wa_call ? 1 : 0,
        allow_webhook ? 1 : 0,
        allow_chat_widget ? 1 : 0,
        allow_agents ? 1 : 0,
      ],
    );

    res.json({ success: true, msg: "Plan has been added" });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong" });
    console.log(err);
  }
});

// update existing plan
router.post("/update_plan_data", adminValidator, async (req, res) => {
  try {
    const {
      id,
      title,
      short_description,
      allow_tag,
      allow_note,
      allow_chatbot,
      contact_limit,
      allow_api,
      is_trial,
      price,
      price_strike,
      plan_duration_in_days,
      qr_account,
      wa_warmer,
      rest_api_qr,
      instagram_inbox,
      telegram_inbox,
      allow_wa_forms, // ✅ NEW
      allow_wa_call,
      allow_webhook,
      allow_chat_widget,
      allow_agents,
    } = req.body;

    if (!id) return res.json({ success: false, msg: "Plan ID is required" });
    if (!title || !short_description || !plan_duration_in_days)
      return res.json({ success: false, msg: "Please fill all details" });

    await query(
      `UPDATE plan SET 
        title = ?, short_description = ?, allow_tag = ?, allow_note = ?,
        allow_chatbot = ?, contact_limit = ?, allow_api = ?, is_trial = ?,
        price = ?, price_strike = ?, plan_duration_in_days = ?,
        qr_account = ?, wa_warmer = ?, rest_api_qr = ?,
        instagram_inbox = ?, telegram_inbox = ?,
        allow_wa_forms = ?,
        allow_wa_call = ?, allow_webhook = ?, allow_chat_widget = ?, allow_agents = ?
       WHERE id = ?`,
      [
        title,
        short_description,
        allow_tag ? 1 : 0,
        allow_note ? 1 : 0,
        allow_chatbot ? 1 : 0,
        parseInt(contact_limit || 0),
        allow_api ? 1 : 0,
        is_trial ? 1 : 0,
        is_trial ? 0 : price,
        price_strike,
        parseInt(plan_duration_in_days || 1),
        parseInt(qr_account) > 0 ? parseInt(qr_account) : 0,
        wa_warmer ? 1 : 0,
        rest_api_qr ? 1 : 0,
        instagram_inbox ? 1 : 0,
        telegram_inbox ? 1 : 0,
        allow_wa_forms ? 1 : 0, // ✅ NEW
        allow_wa_call ? 1 : 0,
        allow_webhook ? 1 : 0,
        allow_chat_widget ? 1 : 0,
        allow_agents ? 1 : 0,
        id,
      ],
    );

    res.json({ success: true, msg: "Plan updated successfully" });
  } catch (err) {
    res.json({ success: false, msg: "Something went wrong" });
    console.log(err);
  }
});

// get plans with user count
router.get("/get_plans", async (req, res) => {
  try {
    const plans = await query(`SELECT * FROM plan`, []);
    const users = await query(`SELECT plan FROM user WHERE plan IS NOT NULL AND plan != ''`, []);
    
    // Count users per plan
    const planUserCounts = {};
    users.forEach(user => {
      try {
        const userPlan = typeof user.plan === 'string' ? JSON.parse(user.plan) : user.plan;
        if (userPlan && userPlan.id) {
          planUserCounts[userPlan.id] = (planUserCounts[userPlan.id] || 0) + 1;
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    // Add user count to each plan
    const plansWithCounts = plans.map(plan => ({
      ...plan,
      userCount: planUserCounts[plan.id] || 0
    }));
    
    res.json({ success: true, data: plansWithCounts });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get web public
router.get("/get_web_public", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM web_public`, []);
    res.json({ data: data[0], success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// del plan
router.post("/del_plan", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;

    await query(`DELETE FROM plan WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Plan was deleted" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get all users
// get all users with plan details
router.get("/get_users", adminValidator, async (req, res) => {
  try {
    const users = await query(`SELECT * FROM user ORDER BY createdAt DESC`, []);
    
    // Enhance user data with parsed plan information
    const enhancedUsers = users.map(user => {
      try {
        // Parse plan if it's a string
        const parsedPlan = typeof user.plan === 'string' && user.plan 
          ? JSON.parse(user.plan) 
          : user.plan;
        
        return {
          ...user,
          plan: parsedPlan,
          trial: Boolean(user.trial),
        };
      } catch (e) {
        return {
          ...user,
          trial: Boolean(user.trial),
        };
      }
    });
    
    res.json({ data: enhancedUsers, success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});
// update user
router.post("/update_user", adminValidator, async (req, res) => {
  try {
    const { newPassword, name, email, mobile_with_country_code, uid } =
      req.body;

    if (!uid || !name || !email || !mobile_with_country_code) {
      return res.json({
        success: false,
        msg: "You forgot to enter some field(s)",
      });
    }

    // Check if email is already taken by another user
    const findUserByEmail = await query(`SELECT * FROM user WHERE email = ?`, [
      email,
    ]);

    if (findUserByEmail.length > 0 && findUserByEmail[0].uid !== uid) {
      return res.json({
        success: false,
        msg: "This email is already taken by another user",
      });
    }

    // Check if user exists
    const findUserByUid = await query(`SELECT * FROM user WHERE uid = ?`, [
      uid,
    ]);

    if (findUserByUid.length === 0) {
      return res.json({
        success: false,
        msg: "User not found",
      });
    }

    // Update user with or without password
    if (newPassword) {
      const hashpass = await bcrypt.hash(newPassword, 10);
      await query(
        `UPDATE user SET name = ?, email = ?, password = ?, mobile_with_country_code = ? WHERE uid = ?`,
        [name, email, hashpass, mobile_with_country_code, uid],
      );
    } else {
      await query(
        `UPDATE user SET name = ?, email = ?, mobile_with_country_code = ? WHERE uid = ?`,
        [name, email, mobile_with_country_code, uid],
      );
    }

    res.json({ msg: "User was updated", success: true });
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      msg: "Something went wrong",
      error: err.message,
    });
  }
});

// update plan
router.post("/update_plan", adminValidator, async (req, res) => {
  try {
    const { plan, uid } = req.body;

    if (!plan || !uid) {
      return res.json({ success: false, msg: "Invalid input provided" });
    }

    const getPlan = await query(`SELECT * FROM plan WHERE id = ?`, [plan?.id]);
    if (getPlan.length < 1) {
      return res.json({ success: false, msg: "Invalid plan found" });
    }

    await updateUserPlan(getPlan[0], uid);

    res.json({ success: true, msg: "User plan was updated" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// Extend a user's plan expiry by N days. Adds days to the current expiry if it
// is still in the future, otherwise counts from now. The user must already
// have a plan assigned. Stores plan_expire as a MySQL datetime string (matches
// the column type and the getNumberOfDaysFromTimestamp parser).
router.post("/extend_user_plan", adminValidator, async (req, res) => {
  try {
    const { uid, days } = req.body;
    const addDays = parseInt(days);

    if (!uid || !addDays || addDays < 1) {
      return res.json({ success: false, msg: "uid and a positive days value are required" });
    }

    const [user] = await query(`SELECT plan, plan_expire FROM user WHERE uid = ?`, [uid]);
    if (!user) {
      return res.json({ success: false, msg: "User not found" });
    }
    if (!user.plan) {
      return res.json({
        success: false,
        msg: "This user has no plan assigned. Assign a plan first.",
      });
    }

    // Determine the base time to extend from.
    const now = Date.now();
    let baseMs = now;
    if (user.plan_expire) {
      const existing =
        user.plan_expire instanceof Date
          ? user.plan_expire.getTime()
          : /^\d+$/.test(String(user.plan_expire).trim())
            ? parseInt(String(user.plan_expire).trim(), 10)
            : Date.parse(
                String(user.plan_expire).includes("T")
                  ? String(user.plan_expire)
                  : String(user.plan_expire).replace(" ", "T"),
              );
      if (!isNaN(existing) && existing > now) {
        baseMs = existing; // still active → extend from current expiry
      }
    }

    const newMs = baseMs + addDays * 24 * 60 * 60 * 1000;
    const mysqlDatetime = new Date(newMs)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await query(`UPDATE user SET plan_expire = ? WHERE uid = ?`, [
      mysqlDatetime,
      uid,
    ]);

    res.json({
      success: true,
      msg: `Plan extended by ${addDays} day(s)`,
      plan_expire: mysqlDatetime,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong" });
  }
});

// get payment gateway admin
router.get("/get_payment_gateway_admin", adminValidator, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM web_private`, []);
    if (data.length < 1) {
      return res.json({ data: {}, success: true });
    }
    res.json({ data: data[0], success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// update payment gateway
router.post("/update_pay_gateway", adminValidator, async (req, res) => {
  try {
    const {
      pay_offline_id,
      pay_offline_key,
      offline_active,
      pay_stripe_id,
      pay_stripe_key,
      stripe_active,
      pay_paypal_id,
      pay_paypal_key,
      paypal_active,
      rz_id,
      rz_key,
      rz_active,
      pay_paystack_id,
      pay_paystack_key,
      paystack_active,
      // ✅ MERCADOPAGO FIELDS ADDED
      pay_mercadopago_public_key,
      pay_mercadopago_access_token,
      mercadopago_active,
    } = req.body;

    await query(
      `UPDATE web_private SET  
            pay_offline_id = ?, 
            pay_offline_key = ?, 
            offline_active = ?,
            pay_stripe_id = ?, 
            pay_stripe_key = ?, 
            stripe_active = ?,
            pay_paypal_id = ?,
            pay_paypal_key = ?,
            paypal_active = ?,
            rz_id = ?,
            rz_key = ?,
            rz_active = ?,
            pay_paystack_id = ?,
            pay_paystack_key = ?,
            paystack_active = ?,
            pay_mercadopago_public_key = ?,
            pay_mercadopago_access_token = ?,
            mercadopago_active = ?
            `,
      [
        pay_offline_id,
        pay_offline_key,
        offline_active,
        pay_stripe_id,
        pay_stripe_key,
        stripe_active,
        pay_paypal_id,
        pay_paypal_key,
        paypal_active,
        rz_id,
        rz_key,
        rz_active,
        pay_paystack_id,
        pay_paystack_key,
        paystack_active,
        // ✅ MERCADOPAGO VALUES ADDED
        pay_mercadopago_public_key,
        pay_mercadopago_access_token,
        mercadopago_active,
      ],
    );

    res.json({ success: true, msg: "Payment gateway updated" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// add partners logo
router.post("/add_brand_image", adminValidator, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.json({ success: false, msg: "No files were uploaded" });
    }

    const randomString = randomstring.generate();
    const file = req.files.file;

    const filename = `${randomString}.${getFileExtension(file.name)}`;

    file.mv(`${__dirname}/../client/public/media/${filename}`, (err) => {
      if (err) {
        console.log(err);
        return res.json({ err });
      }
    });

    await query(`INSERT INTO partners (filename) VALUES (?)`, [filename]);

    res.json({ success: true, msg: "Logo was uploaded" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get all brands
router.get("/get_brands", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM partners`, []);
    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// del image
router.post("/del_brand_logo", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE from partners WHERE id = ?`, [id]);

    res.json({ success: true, msg: "Bran was deleted" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// add faq
router.post("/add_faq", adminValidator, async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!answer || !question) {
      return res.json({
        success: false,
        msg: "Please provide question and answer both",
      });
    }

    await query(`INSERT INTO faq (question, answer) VALUES (?,?)`, [
      question,
      answer,
    ]);

    res.json({ success: true, msg: "Faq was added" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get all faq
router.get("/get_faq", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM faq`, []);
    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// del faq
router.post("/del_faq", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM faq WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Faq was deleted" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// add page
router.post("/add_page", adminValidator, async (req, res) => {
  try {
    const { title, content, slug } = req.body;

    if (!title || !slug) {
      return res.json({ success: false, msg: "Title and slug are required" });
    }

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return res.json({
        success: false,
        msg: "Slug can only contain lowercase letters, numbers and single dashes (e.g. about-us).",
      });
    }

    // Reserved slugs (only for contact-form)
    const reservedSlugs = ["contact-form"];

    if (reservedSlugs.includes(slug)) {
      return res.json({
        success: false,
        msg: "This slug is reserved by the system. Please use another slug.",
      });
    }

    // checking if slug already exists
    const getPage = await query(`SELECT * FROM page WHERE slug = ?`, [slug]);
    if (getPage.length > 0) {
      return res.json({
        success: false,
        msg: "This slug was already used by another page.",
      });
    }

    let filename = null;

    // Image is optional
    if (req.files && req.files.file) {
      const randomString = randomstring.generate();
      const file = req.files.file;

      filename = `${randomString}.${getFileExtension(file.name)}`;

      // Wait for the move so a failure doesn't send a second response
      // and the page isn't saved pointing at a missing image.
      try {
        await file.mv(`${__dirname}/../client/public/media/${filename}`);
      } catch (mvErr) {
        console.log(mvErr);
        return res.json({ success: false, msg: "Failed to upload image" });
      }
    }

    await query(
      `INSERT INTO page (slug, title, image, content) VALUES (?,?,?,?)`,
      [slug, title, filename, content || ''],
    );

    res.json({ success: true, msg: "Page was added" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get all pages
router.get("/get_pages", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM page`);
    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// del page
router.post("/del_page", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;

    await query(`DELETE FROM page WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Page was deleted" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// update page content
router.post("/update_page_content", adminValidator, async (req, res) => {
  try {
    const { id, content } = req.body;

    if (!id) {
      return res.json({ success: false, msg: "Page ID is required" });
    }

    if (content === undefined) {
      return res.json({ success: false, msg: "Content is required" });
    }

    await query(`UPDATE page SET content = ? WHERE id = ?`, [content, id]);
    res.json({ success: true, msg: "Page content updated successfully" });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// auto user login
router.post("/auto_login", adminValidator, async (req, res) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.json({ success: false, msg: "Invalid input" });
    }

    const user = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
    const token = sign(
      {
        uid: user[0].uid,
        role: "user",
        password: user[0].password,
        email: user[0].email,
      },
      process.env.JWTKEY,
      {},
    );
    res.json({
      success: true,
      token: token,
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// ading testtimonial
// ading testtimonial
router.post("/add_testimonial", adminValidator, async (req, res) => {
  try {
    const { title, description, reviewer_name, position } = req.body;

    if (!title || !description || !reviewer_name || !position) {
      return res.json({ success: false, msg: "Please fill all fields" });
    }

    let filename = null;

    // Image is optional
    if (req.files && req.files.image) {
      const randomString = randomstring.generate();
      const file = req.files.image;
      filename = `${randomString}.${getFileExtension(file.name)}`;

      file.mv(`${__dirname}/../client/public/media/${filename}`, (err) => {
        if (err) {
          console.log(err);
          return res.json({ success: false, msg: "Failed to upload image" });
        }
      });
    }

    await query(
      `INSERT INTO testimonial (title, description, reviewer_name, reviewer_position, image) VALUES (?,?,?,?,?)`,
      [title, description, reviewer_name, position, filename],
    );

    res.json({ success: true, msg: "Testimonial was added" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// get all testi
router.get("/get_testi", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM testimonial`, []);
    res.json({ success: true, data });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// del testi
router.post("/del_testi", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;

    await query(`DELETE FROM testimonial WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Testimonial was deleted" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// get orders with enhanced data
router.get("/get_orders", adminValidator, async (req, res) => {
  try {
    const data = await query(
      `
            SELECT 
                orders.id,
                orders.uid,
                orders.payment_mode,
                orders.amount,
                orders.data,
                orders.s_token,
                orders.createdAt AS date,
                user.role,
                user.name AS user,
                user.email,
                user.mobile_with_country_code,
                user.timezone,
                user.plan,
                user.plan_expire,
                user.trial
            FROM orders
            LEFT JOIN user ON orders.uid = user.uid
            ORDER BY orders.createdAt DESC
        `,
      [],
    );

    // Enhance data with calculated status
    const enhancedData = data.map(order => {
      let status = 'completed'; // Default status
      
      try {
        // Parse data field if it contains status information
        if (order.data) {
          const orderData = typeof order.data === 'string' ? JSON.parse(order.data) : order.data;
          if (orderData.status) {
            status = orderData.status;
          }
        }
      } catch (e) {
        // Keep default status if parsing fails
      }
      
      return {
        ...order,
        status: status,
        // Format amount as number
        amount: parseFloat(order.amount) || 0
      };
    });

    res.json({ data: enhancedData, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", success: false, err });
  }
});

router.post("/del_order", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.json({ success: false, msg: "Order ID is required" });
    }
    
    // Admin can delete any order (removed uid check)
    await query(`DELETE FROM orders WHERE id = ?`, [id]);
    
    res.json({ msg: "Order was deleted successfully", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Failed to delete order", success: false, err });
  }
});

// get all contact forms
router.get("/get_contact_leads", adminValidator, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM contact_form LIMIT 500`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// del contact entry
router.post("/del_cotact_entry", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM contact_form WHERE id = ?`, [id]);
    res.json({ success: true, msg: "Entry was deleted" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// get page by slug
router.post("/get_page_slug", async (req, res) => {
  try {
    const { slug } = req.body;

    const data = await query(`SELECT * FROM page WHERE slug = ?`, [slug]);
    if (data.length < 1) {
      return res.json({ data: {}, success: true, page: false });
    } else {
      return res.json({ data: data[0], success: true, page: true });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});
// update termns
router.post("/update_terms", adminValidator, async (req, res) => {
  try {
    const { title, content } = req.body;

    // check
    const getPP = await query(`SELECT * FROM page WHERE slug = ?`, [
      "terms-and-conditions",
    ]);

    if (getPP.length > 0) {
      await query(`UPDATE page SET title = ?, content = ? WHERE slug = ?`, [
        title,
        content,
        "terms-and-conditions",
      ]);
    } else {
      await query(
        `INSERT INTO page (slug, title, content, permanent) VALUES (?,?,?,?)`,
        ["terms-and-conditions", title, content, 1],
      );
    }

    res.json({ success: true, msg: "Page updated" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// update privacy policy
router.post("/update_privacy_policy", adminValidator, async (req, res) => {
  try {
    const { title, content } = req.body;

    // check
    const getPP = await query(`SELECT * FROM page WHERE slug = ?`, [
      "privacy-policy",
    ]);

    if (getPP.length > 0) {
      await query(`UPDATE page SET title = ?, content = ? WHERE slug = ?`, [
        title,
        content,
        "privacy-policy",
      ]);
    } else {
      await query(
        `INSERT INTO page (slug, title, content, permanent) VALUES (?,?,?,?)`,
        ["privacy-policy", title, content, 1],
      );
    }

    res.json({ success: true, msg: "Page updated" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// get smtp
router.get("/get_smtp", adminValidator, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM smtp`, []);
    if (data.length < 1) {
      return res.json({ data: { id: "ID" }, success: true });
    } else {
      return res.json({ data: data[0], success: true });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// update smtp
router.post("/update_smtp", adminValidator, async (req, res) => {
  try {
    const { email, port, password, host, username } = req.body;

    if (!email || !port || !password || !host || !username) {
      return res.json({ msg: "Please fill all the fields" });
    }

    const getOne = await query(`SELECT * FROM smtp`, []);
    if (getOne.length < 1) {
      await query(
        `INSERT INTO smtp (email, host, port, password, username) VALUES (?,?,?,?,?)`,
        [email, host, port, password, username],
      );
    } else {
      await query(
        `UPDATE smtp SET email = ?, host = ?, port = ?, password = ?, username = ? WHERE id = ?`,
        [email, host, port, password, username, getOne[0].id],
      );
    }

    res.json({ success: true, msg: "Email settings was updated" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// send test email
router.post("/send_test_email", adminValidator, async (req, res) => {
  try {
    const { email, port, password, host, to, username } = req.body;

    if (!email || !port || !password || !host || !username) {
      return res.json({ msg: "Please fill all the fields" });
    }

    const checkEmail = await sendEmail(
      host,
      port,
      email,
      password,
      `<h1>This is a test SMTP email!</h1>`,
      "SMTP Testing",
      "Testing Sender",
      to,
      username,
    );

    if (checkEmail.success) {
      res.json({ msg: "Email sent", success: true });
    } else {
      res.json({ msg: checkEmail?.err });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// get dashboard for user
router.get("/get_dashboard_for_user", adminValidator, async (req, res) => {
  try {
    const [
      totalUsers,
      paidSignupsByMonth,
      unpaidSignupsByMonth,
      totalOrders,
      ordersByMonth,
      totalContacts,
      totalChats,
      chatsByMonth,
      messagesByMonth,
      messageTypes,
      agents,
      agentTasks,
      activeInstances,
      flowsLength,
      recentUsers,
      recentOrders,
    ] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM user`),
      query(`
        SELECT 
          MONTH(createdAt) as month, 
          COUNT(*) as count,
          MAX(JSON_EXTRACT(plan, '$.is_trial')) as is_trial
        FROM user 
        GROUP BY MONTH(createdAt)
      `),
      query(`
        SELECT 
          MONTH(createdAt) as month, 
          COUNT(*) as count
        FROM user 
        WHERE JSON_EXTRACT(plan, '$.is_trial') = 1 OR plan = '{}' OR plan IS NULL
        GROUP BY MONTH(createdAt)
      `),
      query(`SELECT COUNT(*) as count FROM orders`),
      query(`
        SELECT 
          MONTH(createdAt) as month, 
          SUM(amount) as total 
        FROM orders 
        GROUP BY MONTH(createdAt)
      `),
      query(`SELECT COUNT(*) as count FROM contact_form`),
      query(`SELECT COUNT(*) as count FROM beta_chats`),
      query(`
        SELECT 
          DATE(createdAt) as date, 
          COUNT(*) as count 
        FROM beta_chats 
        GROUP BY DATE(createdAt) 
        ORDER BY date ASC
      `),
      query(`
        SELECT 
          DATE(createdAt) as date, 
          COUNT(*) as count 
        FROM beta_conversation 
          GROUP BY DATE(createdAt) 
        ORDER BY date ASC
      `),
      query(`
        SELECT 
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') = 'text' THEN 1 ELSE 0 END) as text,
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') = 'image' THEN 1 ELSE 0 END) as image,
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') = 'video' THEN 1 ELSE 0 END) as video,
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') = 'document' THEN 1 ELSE 0 END) as document,
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') = 'location' THEN 1 ELSE 0 END) as location,
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') = 'contact' THEN 1 ELSE 0 END) as contact,
          SUM(CASE WHEN JSON_EXTRACT(msgContext, '$.type') IS NULL OR JSON_EXTRACT(msgContext, '$.type') = '' THEN 1 ELSE 0 END) as other
        FROM beta_conversation
      `),
      query(`SELECT * FROM agents LIMIT 10`),
      query(`SELECT * FROM agent_task LIMIT 100`),
      query(`SELECT COUNT(*) as count FROM instance WHERE status = 'ACTIVE'`),
      query(`SELECT COUNT(*) as count FROM beta_flows`),
      query(`SELECT id, name, email, plan, createdAt FROM user ORDER BY createdAt DESC LIMIT 5`),
      query(`SELECT id, uid, amount, createdAt FROM orders ORDER BY createdAt DESC LIMIT 5`),
    ]);

    const paid = Array(12).fill(0);
    const unpaid = Array(12).fill(0);
    paidSignupsByMonth.forEach((row) => {
      const month = row.month - 1;
      if (month >= 0 && month < 12) paid[month] = row.count;
    });
    unpaidSignupsByMonth.forEach((row) => {
      const month = row.month - 1;
      if (month >= 0 && month < 12) unpaid[month] = row.count;
    });

    const orders = Array(12).fill(0);
    ordersByMonth.forEach((row) => {
      const month = row.month - 1;
      if (month >= 0 && month < 12) orders[month] = parseFloat(row.total) || 0;
    });

    const chatsByMonthArr = Array(12).fill(0);
    chatsByMonth.forEach((row) => {
      const month = new Date(row.date).getMonth();
      chatsByMonthArr[month] = row.count;
    });

    const messagesByMonthArr = Array(12).fill(0);
    messagesByMonth.forEach((row) => {
      const month = new Date(row.date).getMonth();
      messagesByMonthArr[month] = row.count;
    });

    const messageTypesArr = messageTypes[0]
      ? [
          messageTypes[0].text || 0,
          messageTypes[0].image || 0,
          messageTypes[0].video || 0,
          messageTypes[0].document || 0,
          messageTypes[0].location || 0,
          messageTypes[0].contact || 0,
          messageTypes[0].other || 0,
        ]
      : [0, 0, 0, 0, 0, 0, 0];

    const agentPerformance = agents.slice(0, 3).map((agent) => {
      const thisAgentTasks = agentTasks.filter((task) => task.uid === agent.uid);
      const completedTasks = thisAgentTasks.filter(
        (task) => task.status === "COMPLETED",
      ).length;
      const completionRate =
        thisAgentTasks.length > 0
          ? (completedTasks / thisAgentTasks.length) * 100
          : 0;

      return {
        name: agent.name,
        data: [
          thisAgentTasks.length,
          completedTasks,
          completionRate,
        ],
      };
    });

    const safeParsePlanTitle = (plan) => {
      if (!plan) return "No Plan";
      try {
        const parsed = typeof plan === "string" ? JSON.parse(plan) : plan;
        return parsed?.title || "No Plan";
      } catch {
        return "No Plan";
      }
    };

    const recentUsersData = recentUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      plan: safeParsePlanTitle(user.plan),
      date: new Date(user.createdAt).toISOString().split("T")[0],
    }));

    const recentTransactions = recentOrders.map((order) => {
      const user = totalUsers[0]?.count > 0 ? "User" : "Unknown";
      return {
        id: order.id,
        user,
        amount: `₹${order.amount}`,
        plan: "Subscription",
        status: "Completed",
        date: new Date(order.createdAt).toISOString().split("T")[0],
      };
    });

    // Real system metrics from the host machine.
    const os = require("os");
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

    // Load average (1 min) as a percentage of available CPU cores.
    const cpuCount = os.cpus().length || 1;
    const loadAvg1 = os.loadavg()[0]; // 0 on Windows — fall back to process CPU
    const serverLoad =
      loadAvg1 > 0
        ? Math.min(100, Math.round((loadAvg1 / cpuCount) * 100))
        : Math.min(
            100,
            Math.round(
              (process.memoryUsage().rss / totalMem) * 100,
            ),
          );

    // Count live socket connections as active sessions if available.
    let activeSessions = 0;
    try {
      const { getSocketIo } = require("../socket");
      const io = typeof getSocketIo === "function" ? getSocketIo() : null;
      activeSessions = io ? io.sockets.sockets.size : 0;
    } catch {
      activeSessions = 0;
    }

    const systemMetrics = {
      serverLoad,
      memoryUsage,
      // Disk usage isn't reliably available cross-platform without extra deps;
      // report process heap usage as a lightweight proxy instead.
      diskSpace: Math.min(
        100,
        Math.round(
          (process.memoryUsage().heapUsed /
            process.memoryUsage().heapTotal) *
            100,
        ),
      ),
      activeSessions,
    };

    res.json({
      data: {
        paid,
        unpaid,
        userLength: totalUsers[0]?.count || 0,
        recentUsers: recentUsersData,

        orders,
        orderLength: totalOrders[0]?.count || 0,
        recentTransactions,

        contactLength: totalContacts[0]?.count || 0,
        chatLength: totalChats[0]?.count || 0,
        chatsByMonth: chatsByMonthArr,
        messagesByMonth: messagesByMonthArr,
        messageTypes: messageTypesArr,

        agentLength: agents.length,
        agentPerformance,

        activeInstances: activeInstances[0]?.count || 0,
        flowsLength: flowsLength[0]?.count || 0,
        systemMetrics,
      },
      success: true,
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// Helper function to get user signups by month
function getUserSignupsByMonth(users) {
  const paidSignupsByMonth = Array(12).fill(0);
  const unpaidSignupsByMonth = Array(12).fill(0);

  users.forEach((user) => {
    const createdAt = new Date(user.createdAt);
    const month = createdAt.getMonth();

    // Check if user has a paid plan
    const plan = JSON.parse(user.plan || "{}");
    const isPaid = plan && plan.is_trial === 0;

    if (isPaid) {
      paidSignupsByMonth[month]++;
    } else {
      unpaidSignupsByMonth[month]++;
    }
  });

  return { paidSignupsByMonth, unpaidSignupsByMonth };
}

// Helper function to get orders by month
function getUserOrderssByMonth(orders) {
  const ordersByMonth = Array(12).fill(0);

  orders.forEach((order) => {
    const createdAt = new Date(order.createdAt);
    const month = createdAt.getMonth();
    const amount = parseFloat(order.amount) || 0;

    ordersByMonth[month] += amount;
  });

  return ordersByMonth;
}

// Helper function to get chats by month
function getChatsByMonth(chats) {
  const chatsByMonth = Array(12).fill(0);

  chats.forEach((chat) => {
    const createdAt = new Date(chat.createdAt);
    const month = createdAt.getMonth();

    chatsByMonth[month]++;
  });

  return chatsByMonth;
}

// Helper function to get messages by month
function getMessagesByMonth(conversations) {
  const messagesByMonth = Array(12).fill(0);

  conversations.forEach((conversation) => {
    const createdAt = new Date(conversation.createdAt);
    const month = createdAt.getMonth();

    messagesByMonth[month]++;
  });

  return messagesByMonth;
}

// Helper function to get message type distribution
function getMessageTypeDistribution(conversations) {
  const types = {
    text: 0,
    image: 0,
    video: 0,
    document: 0,
    location: 0,
    contact: 0,
    other: 0,
  };

  conversations.forEach((conversation) => {
    try {
      const msgContext = JSON.parse(conversation.msgContext || "{}");
      const type = msgContext.type || "other";

      if (types[type] !== undefined) {
        types[type]++;
      } else {
        types.other++;
      }
    } catch (error) {
      types.other++;
    }
  });

  return [
    types.text,
    types.image,
    types.video,
    types.document,
    types.location,
    types.contact,
    types.other,
  ];
}

// Helper function to get agent performance
function getAgentPerformance(agents, tasks) {
  return agents.slice(0, 3).map((agent) => {
    const agentTasks = tasks.filter((task) => task.uid === agent.uid);
    const completedTasks = agentTasks.filter(
      (task) => task.status === "COMPLETED",
    ).length;
    const completionRate =
      agentTasks.length > 0 ? (completedTasks / agentTasks.length) * 100 : 0;

    // Generate some random metrics for demo purposes
    return {
      name: agent.name,
      data: [
        Math.floor(Math.random() * 30) + 70, // Response time (70-100)
        completionRate || Math.floor(Math.random() * 20) + 75, // Resolution rate
        Math.floor(Math.random() * 15) + 80, // Customer rating
        Math.floor(Math.random() * 25) + 70, // Chats handled
        Math.floor(Math.random() * 20) + 75, // Tasks completed
      ],
    };
  });
}

// get admin
router.get("/get_admin", adminValidator, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM admin`, []);
    res.json({ data: data[0], success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// update admin
router.post("/update-admin", adminValidator, async (req, res) => {
  try {
    if (req.body.newpass) {
      const hash = await bcrypt.hash(req.body.newpass, 10);
      await query(`UPDATE admin SET email = ?, password = ? WHERE uid = ?`, [
        req.body.email,
        hash,
        req.decode.uid,
      ]);
      res.json({ success: true, msg: "Admin was updated refresh the page" });
    } else {
      await query(`UPDATE admin SET email = ? WHERE uid = ?`, [
        req.body.email,
        req.decode.uid,
      ]);
      res.json({ success: true, msg: "Admin was updated refresh the page" });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
});

// send recover
router.post("/send_resovery", async (req, res) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.json({ msg: "Please enter a valid email" });
    }

    const checkEmailValid = await query(`SELECT * FROM admin WHERE email = ?`, [
      email,
    ]);
    if (checkEmailValid.length < 1) {
      return res.json({
        success: true,
        msg: "We have sent a recovery link if this email is associated with admin account.",
      });
    }

    const getWeb = await query(`SELECT * FROM web_public`, []);
    const appName = getWeb[0]?.app_name;

    const jsontoken = sign(
      {
        old_email: email,
        email: email,
        time: moment(new Date()),
        password: checkEmailValid[0]?.password,
        role: "admin",
      },
      process.env.JWTKEY,
      {},
    );

    const recpveryUrl = `${process.env.FRONTENDURI}/recovery-admin/${jsontoken}`;

    const getHtml = recoverEmail(appName, recpveryUrl);

    // getting smtp
    const smtp = await query(`SELECT * FROM smtp`, []);
    if (
      !smtp[0]?.email ||
      !smtp[0]?.host ||
      !smtp[0]?.port ||
      !smtp[0]?.password ||
      !smtp[0]?.username
    ) {
      return res.json({
        success: false,
        msg: "SMTP connections not found! Unable to send recovery link",
      });
    }

    await sendEmail(
      smtp[0]?.host,
      smtp[0]?.port,
      smtp[0]?.email,
      smtp[0]?.password,
      getHtml,
      `${appName} - Password Recovery`,
      smtp[0]?.email,
      email,
      smtp[0]?.username,
    );

    res.json({
      success: true,
      msg: "We have sent your a password recovery link. Please check your email",
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// modify recpvery passwrod
router.get("/modify_password", adminValidator, async (req, res) => {
  try {
    const { pass } = req.query;

    if (!pass) {
      return res.json({ success: false, msg: "Please provide a password" });
    }

    if (moment(req.decode.time).diff(moment(new Date()), "hours") > 1) {
      return res.json({ success: false, msg: "Token expired" });
    }

    const hashpassword = await bcrypt.hash(pass, 10);

    const result = await query(
      `UPDATE admin SET password = ? WHERE email = ?`,
      [hashpassword, req.decode.old_email],
    );

    res.json({
      success: true,
      msg: "Your password has been changed. You may login now! Redirecting...",
      data: result,
    });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// del user
router.post("/del_user", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM user WHERE id = ?`, [id]);

    await query(`DELETE FROM meta_api WHERE uid = ?`, [id]);
    res.json({ success: true, msg: "User was deletd" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// get all genn wa links
router.get("/get_wa_gen", adminValidator, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM gen_links`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// del gen link
router.post("/de_wa_den_link", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM gen_links WHERE id = ?`, [id]);
    res.json({ msg: "Generated link was deleted", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// get social login
router.get("/get_social_login", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM web_public`, []);
    res.json({ data: data[0], success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// update social things
router.post("/update_social_login", adminValidator, async (req, res) => {
  try {
    const {
      google_client_id,
      google_login_active,
      fb_login_app_id,
      fb_login_app_sec,
      fb_login_active,
    } = req.body;

    await query(
      `UPDATE web_public SET google_client_id = ?, google_login_active = ?, fb_login_app_id = ?, fb_login_app_sec = ?, fb_login_active = ?`,
      [
        google_client_id,
        google_login_active,
        fb_login_app_id,
        fb_login_app_sec,
        fb_login_active,
      ],
    );

    res.json({ msg: "Settings updated", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// update rtl
router.post("/update_rtl", adminValidator, async (req, res) => {
  try {
    const { rtl } = req.body;

    await query(`UPDATE web_public SET rtl = ?`, [rtl ? 1 : 0]);

    res.json({ success: true, msg: "RTL was updated" });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// update qr plugin setting
router.get("/get_qr_set", adminValidator, async (req, res) => {
  try {
    const [web] = await query(`SELECT * FROM web_private`, []);
    if (!web) return res.json({ msg: "Web private not found" });

    res.json({ success: true, data: web });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// update qr set
router.post("/update_qr_set", adminValidator, async (req, res) => {
  try {
    const { type, mongodbString } = req.body;
    if (!["local", "mysql", "mongodb"]?.includes(type)) {
      return res.json({ msg: "Invalid type found" });
    }

    if (type === "mongodb") {
      if (!mongodbString) {
        return res.json({ msg: "MongoDB String not found" });
      }

      const testMongo = await testMongoConnection(mongodbString);
      if (!testMongo.success) {
        return res.json({ msg: testMongo.msg });
      }
    }

    await query(`UPDATE web_private SET qr_storage = ?, mongodb_string = ?`, [
      type,
      mongodbString,
    ]);

    res.json({ msg: "QR settings updated", success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// get mobile app.
router.get("/get_mobile_app_dt", adminValidator, async (req, res) => {
  try {
    const [data] = await query(`SELECT * FROM mobile_app`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// requires mb
router.post("/update_mb", adminValidator, async (req, res) => {
  try {
    const { fcmJson, appTheme } = req.body;
    const [data] = await query(`SELECT * FROM mobile_app`, []);
    if (data) {
      await query(`UPDATE mobile_app SET fcmJson = ?, appTheme = ?`, [
        fcmJson,
        appTheme,
      ]);
    } else {
      await query(`INSERT INTO mobile_app (fcmJson, appTheme) VALUES (?,?)`, [
        fcmJson,
        appTheme,
      ]);
    }

    res.json({ msg: "Updated", success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// update web pvt
router.post("/update_embed_config", adminValidator, async (req, res) => {
  try {
    const { embed_app_sec, embed_app_id, embed_app_config } = req.body;
    await query(
      `UPDATE web_private SET embed_app_sec = ?, embed_app_id = ?, embed_app_config = ?`,
      [embed_app_sec, embed_app_id, embed_app_config],
    );
    res.json({ msg: "Updated", success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// get telegram confi
router.get("/get_tele_config", adminValidator, async (req, res) => {
  try {
    const [data] = await query(
      `SELECT teleAppId, teleHash FROM web_private`,
      [],
    );
    res.json({ data, success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

// update teleg config
router.post("/update_tele_config", adminValidator, async (req, res) => {
  try {
    const { teleAppId, teleHash } = req.body;
    await query(`UPDATE web_private SET teleAppId = ?, teleHash = ?`, [
      teleAppId,
      teleHash,
    ]);

    res.json({ msg: "Updated", success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", err, success: false });
  }
});

const validateLastNode = (nodes, edges) => {
  // Find all target nodes (nodes that have incoming connections)
  const targetNodeIds = new Set(edges.map((edge) => edge.target));

  // Find source nodes that aren't targets (potential starting nodes)
  const startingNodes = nodes.filter((node) => !targetNodeIds.has(node.id));

  // If no edges exist, just check the last node in array
  if (edges.length === 0) {
    const lastNode = nodes[nodes.length - 1];
    if (lastNode?.data?.moveToNextNode) {
      return {
        isValid: false,
        message: `${lastNode?.type} Node cannot be last.`,
      };
    }
    return { isValid: true };
  }

  // Traverse the flow to find the actual last connected node
  let lastConnectedNode = null;
  const visited = new Set();

  const traverse = (currentNodeId) => {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    const outgoingEdges = edges.filter((edge) => edge.source === currentNodeId);
    if (outgoingEdges.length === 0) {
      const node = nodes.find((n) => n.id === currentNodeId);
      if (
        node &&
        (!lastConnectedNode || node.position.x > lastConnectedNode.position.x)
      ) {
        lastConnectedNode = node;
      }
      return;
    }

    outgoingEdges.forEach((edge) => {
      traverse(edge.target);
    });
  };

  // Start traversal from all starting nodes
  startingNodes.forEach((node) => traverse(node.id));

  if (lastConnectedNode?.data?.moveToNextNode) {
    return {
      isValid: false,
      message: `${lastConnectedNode?.type} Node cannot be last in the flow.`,
    };
  }

  return { isValid: true };
};

// add flow template
router.post("/add_flow_template", adminValidator, async (req, res) => {
  try {
    const { data, title, description, source } = req.body;

    if (!title || !data || !description) {
      return res.json({ msg: "Please fill all the fields", success: false });
    }

    const nodesVar = data?.nodes || [];

    const validation = validateLastNode(nodesVar, data?.edges);
    if (!validation.isValid) {
      return res.json({ msg: validation.message, success: false });
    }

    const sourceTypes = [
      "wa_chatbot",
      "webhook_flow",
      "webhook_automation",
      "telegram_chatbot",
    ];

    if (!sourceTypes.includes(source)) {
      return res.json({
        msg: `Unknown flow source found: ${source}`,
        success: false,
      });
    }

    if (data?.nodes?.length < 1 || data?.edges?.length < 1) {
      return res.json({ msg: "Blank flow can ot be saved", success: false });
    }

    await query(
      `INSERT INTO flow_templates (title, description, source, data) VALUES (?,?,?,?)`,
      [title, description, source, JSON.stringify(data)],
    );

    res.json({ msg: "Flow template added successfully", success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", success: false });
  }
});

// get admin flow temp
router.get("/get_flow_templates", async (req, res) => {
  try {
    const data = await query(`SELECT * FROM flow_templates`, []);
    res.json({ data, success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", success: false });
  }
});

// delete flow template
router.post("/delete_flow_template", adminValidator, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.json({ msg: "Flow template ID is required", success: false });
    }

    await query(`DELETE FROM flow_templates WHERE id = ?`, [id]);

    res.json({ msg: "Flow template deleted successfully", success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", success: false });
  }
});

// get fcm data admin
router.get("/get_fcm_data", adminValidator, async (req, res) => {
  try {
    const [data] = await query(
      `SELECT fcm_apiKey, 
      fcm_authDomain, 
      fcm_projectId, 
      fcm_storageBucket, 
      fcm_messagingSenderId, 
      fcm_appId, 
      fcm_measurementId, 
      fcm_vapidKey, 
      fcm_clientEmail, 
      fcm_privateKey FROM web_private`,
      [],
    );
    res.json({ data, success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", success: false });
  }
});

router.post("/update_fcm_data", adminValidator, async (req, res) => {
  try {
    const {
      fcm_apiKey,
      fcm_authDomain,
      fcm_projectId,
      fcm_storageBucket,
      fcm_messagingSenderId,
      fcm_appId,
      fcm_measurementId,
      fcm_vapidKey,
      fcm_clientEmail,
      fcm_privateKey,
    } = req.body;

    await query(
      `UPDATE web_private SET
        fcm_apiKey = ?,
        fcm_authDomain = ?,
        fcm_projectId = ?,
        fcm_storageBucket = ?,
        fcm_messagingSenderId = ?,
        fcm_appId = ?,
        fcm_measurementId = ?,
        fcm_vapidKey = ?,
        fcm_clientEmail = ?,
        fcm_privateKey = ?`,
      [
        fcm_apiKey,
        fcm_authDomain,
        fcm_projectId,
        fcm_storageBucket,
        fcm_messagingSenderId,
        fcm_appId,
        fcm_measurementId,
        fcm_vapidKey,
        fcm_clientEmail,
        fcm_privateKey,
      ],
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ msg: "Something went wrong", success: false });
  }
});

// ─── Test FCM configuration ──────────────────────────────────────────────────
router.post("/test_fcm_config", adminValidator, async (req, res) => {
  const checks = {
    db_config:       { ok: false, msg: "" },
    credentials:     { ok: false, msg: "" },
    firebase_init:   { ok: false, msg: "" },
    send_test:       { ok: false, msg: "" },
    subscribers:     { ok: false, msg: "", count: 0 },
  };

  try {
    // ── 1. Read config from DB ──────────────────────────────────────────────
    const [cfg] = await query(
      `SELECT fcm_apiKey, fcm_projectId, fcm_messagingSenderId, fcm_appId,
              fcm_vapidKey, fcm_clientEmail, fcm_privateKey FROM web_private`,
      []
    );

    if (!cfg) {
      checks.db_config.msg = "No web_private row found in database.";
      return res.json({ success: false, checks });
    }

    const missing = [];
    if (!cfg.fcm_apiKey)            missing.push("API Key");
    if (!cfg.fcm_projectId)         missing.push("Project ID");
    if (!cfg.fcm_messagingSenderId) missing.push("Messaging Sender ID");
    if (!cfg.fcm_appId)             missing.push("App ID");
    if (!cfg.fcm_vapidKey)          missing.push("VAPID Key");
    if (!cfg.fcm_clientEmail)       missing.push("Client Email");
    if (!cfg.fcm_privateKey)        missing.push("Private Key");

    if (missing.length > 0) {
      checks.db_config.ok  = false;
      checks.db_config.msg = `Missing fields: ${missing.join(", ")}`;
      return res.json({ success: false, checks });
    }

    checks.db_config.ok  = true;
    checks.db_config.msg = "All config fields present in database.";

    // ── 2. Validate credential format ──────────────────────────────────────
    const emailOk = /^.+@.+\.iam\.gserviceaccount\.com$/.test(cfg.fcm_clientEmail);
    const keyOk   = cfg.fcm_privateKey.includes("BEGIN PRIVATE KEY") ||
                    cfg.fcm_privateKey.includes("BEGIN RSA PRIVATE KEY");
    const vapidOk = cfg.fcm_vapidKey.length > 30;

    if (!emailOk) {
      checks.credentials.msg = "Client email format looks wrong — expected format: xxx@xxx.iam.gserviceaccount.com";
      return res.json({ success: false, checks });
    }
    if (!keyOk) {
      checks.credentials.msg = "Private key format looks wrong — should start with -----BEGIN PRIVATE KEY-----";
      return res.json({ success: false, checks });
    }
    if (!vapidOk) {
      checks.credentials.msg = "VAPID key looks too short — copy the full key from Firebase Console → Cloud Messaging.";
      return res.json({ success: false, checks });
    }
    checks.credentials.ok  = true;
    checks.credentials.msg = "Credential formats look valid.";

    // ── 3. Initialize the named Firebase app ───────────────────────────────
    const admin = require("firebase-admin");
    const TEST_APP_NAME = "web-fcm-test";

    let testApp;
    try {
      const privateKey = cfg.fcm_privateKey.replace(/\\n/g, "\n").trim();
      const existing   = admin.apps.find((a) => a && a.name === TEST_APP_NAME);
      if (existing) {
        try { await existing.delete(); } catch (_) {}
      }
      testApp = admin.initializeApp(
        {
          credential: admin.credential.cert({
            projectId:   cfg.fcm_projectId,
            clientEmail: cfg.fcm_clientEmail,
            privateKey,
          }),
        },
        TEST_APP_NAME
      );
      checks.firebase_init.ok  = true;
      checks.firebase_init.msg = `Firebase app initialized for project "${cfg.fcm_projectId}".`;
    } catch (initErr) {
      checks.firebase_init.msg = `Firebase init failed: ${initErr.message}`;
      return res.json({ success: false, checks });
    }

    // ── 4. Dry-run send to verify credentials ──────────────────────────────
    // We send to a known-invalid token — Firebase rejects with
    // "registration-token-not-registered" which proves auth worked.
    // Any auth error (403 / invalid credential) is a real failure.
    try {
      await admin.messaging(testApp).send({
        token: "test-token-diagnostic-probe",
        notification: { title: "FCM Config Test", body: "Credential check" },
      });
      // If it somehow succeeds (shouldn't with a fake token):
      checks.send_test.ok  = true;
      checks.send_test.msg = "Send succeeded (unexpected with test token — credentials are valid).";
    } catch (sendErr) {
      const code = sendErr.code || sendErr.message || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        // Expected — bad token but credentials authenticated successfully.
        checks.send_test.ok  = true;
        checks.send_test.msg = "Firebase credentials authenticated successfully (test token rejected as expected).";
      } else if (
        code.includes("invalid-credential") ||
        code.includes("auth/") ||
        code.includes("403")
      ) {
        checks.send_test.msg = `Authentication failed — check Client Email / Private Key. Error: ${sendErr.message}`;
        return res.json({ success: false, checks });
      } else {
        checks.send_test.msg = `Send test error: ${sendErr.message}`;
        return res.json({ success: false, checks });
      }
    } finally {
      try { await testApp.delete(); } catch (_) {}
    }

    // ── 5. Subscriber count ────────────────────────────────────────────────
    const subs = await query(`SELECT COUNT(*) AS cnt FROM fcm_tokens`, []);
    const subCount = Number(subs[0]?.cnt || 0);
    checks.subscribers.ok    = true;
    checks.subscribers.count = subCount;
    checks.subscribers.msg   = subCount > 0
      ? `${subCount} device(s) subscribed and ready to receive notifications.`
      : "No subscribers yet. Users need to open the app (over HTTPS/ngrok) and grant notification permission.";

    return res.json({
      success: true,
      msg: "Firebase configuration is valid and working.",
      checks,
    });
  } catch (err) {
    console.error("test_fcm_config error:", err);
    return res.json({
      success: false,
      msg: err.message || "Unexpected error during FCM config test.",
      checks,
    });
  }
});

// get fcm token users
router.get("/get_fcm_subs", adminValidator, async (req, res) => {
  try {
    const data = await query(
      `
       SELECT 
        f.id,
        f.uid,
        f.token,
        u.name AS userName,
        u.email AS userEmail,
        a.name AS agentName,
        a.email AS agentEmail
      FROM fcm_tokens f
      LEFT JOIN user u ON u.uid = f.uid
      LEFT JOIN agents a ON a.uid = f.uid
      `,
      [],
    );

    const result = data.map((t) => {
      // SAFETY CHECK (important)
      if (t.userEmail && t.agentEmail) {
        throw new Error(`UID ${t.uid} exists in BOTH users and agents`);
      }

      const isUser = !!t.userEmail;

      return {
        id: t.id,
        uid: t.uid,
        token: t.token,
        userEmail: isUser ? t.userEmail : t.agentEmail,
        userName: isUser ? t.userName : t.agentName,
        userType: isUser ? "user" : "agent",
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      msg: err.message || "Something went wrong",
    });
  }
});

// send web push manually
router.post("/send_fcm_manul", adminValidator, async (req, res) => {
  try {
    // ── Validate FCM credentials ─────────────────────────────────────────────
    const [fcmData] = await query(
      `SELECT fcm_projectId, fcm_clientEmail, fcm_privateKey FROM web_private`,
      [],
    );

    if (!fcmData) {
      return res.json({
        success: false,
        msg: "FCM configuration not found in database.",
      });
    }

    const { fcm_projectId, fcm_clientEmail, fcm_privateKey } = fcmData;

    if (!fcm_projectId) {
      return res.json({
        success: false,
        msg: "FCM Project ID is missing. Please configure it in settings.",
      });
    }

    if (!fcm_clientEmail) {
      return res.json({
        success: false,
        msg: "FCM Client Email is missing. Please configure it in settings.",
      });
    }

    if (!fcm_privateKey) {
      return res.json({
        success: false,
        msg: "FCM Private Key is missing. Please configure it in settings.",
      });
    }

    // ── Validate request payload ─────────────────────────────────────────────
    const { tokens, notification, audienceType, totalRecipients } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.json({
        success: false,
        msg: "No recipient tokens provided. Make sure selected audience has active subscriptions.",
      });
    }

    if (!notification?.title) {
      return res.json({
        success: false,
        msg: "Notification title is required.",
      });
    }

    if (!notification?.body) {
      return res.json({
        success: false,
        msg: "Notification body is required.",
      });
    }

    const fcmResult = await sendFcmPushNotification({
      fcm_projectId,
      fcm_clientEmail,
      fcm_privateKey,
      tokens,
      notification,
    });

    if (!fcmResult.success) {
      return res.json({
        success: false,
        msg: fcmResult.msg,
      });
    }

    return res.json({
      success: true,
      msg: `Push sent — ${fcmResult.successCount} delivered, ${fcmResult.failureCount} failed.`,
      data: {
        successCount: fcmResult.successCount,
        failureCount: fcmResult.failureCount,
        totalSent: fcmResult.totalSent,
        audienceType,
        totalRecipients,
        results: fcmResult.results,
      },
    });
  } catch (err) {
    console.error("FCM Send Error:", err);
    return res.json({
      success: false,
      msg:
        err.message || "Something went wrong while sending push notifications.",
    });
  }
});

// ─── Exchange Rate Management ─────────────────────────────────────────────────
// Get current exchange rate info (live vs cached)
router.get("/get_exchange_rate_info", adminValidator, async (req, res) => {
  try {
    const { getExchangeRateInfo } = require("../helper/exchangeRate");
    const info = await getExchangeRateInfo();
    
    if (info) {
      res.json({
        success: true,
        data: info,
      });
    } else {
      res.json({
        success: false,
        msg: "Could not fetch exchange rate info",
      });
    }
  } catch (err) {
    console.error("Exchange rate error:", err);
    res.json({
      success: false,
      msg: "Error fetching exchange rate",
      err: err.toString(),
    });
  }
});

// Manually update exchange rate
router.post("/update_exchange_rate", adminValidator, async (req, res) => {
  try {
    const { rate } = req.body;
    
    if (!rate || isNaN(rate) || rate <= 0) {
      return res.json({
        success: false,
        msg: "Please provide a valid exchange rate",
      });
    }
    
    const { setExchangeRate } = require("../helper/exchangeRate");
    const success = await setExchangeRate(rate);
    
    if (success) {
      res.json({
        success: true,
        msg: `Exchange rate updated to 1 USD = ${rate} INR`,
      });
    } else {
      res.json({
        success: false,
        msg: "Failed to update exchange rate",
      });
    }
  } catch (err) {
    console.error("Exchange rate update error:", err);
    res.json({
      success: false,
      msg: "Error updating exchange rate",
      err: err.toString(),
    });
  }
});

module.exports = router;

