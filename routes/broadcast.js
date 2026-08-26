const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const randomstring = require("randomstring");
const bcrypt = require("bcrypt");
const {
  createMetaTemplet,
  getMetaNumberDetail,
} = require("../functions/function.js");
const { sign } = require("jsonwebtoken");
const validateUser = require("../middlewares/user.js");
const { checkPlan } = require("../middlewares/plan.js");

// adding campaign
router.post("/add_new", validateUser, checkPlan, async (req, res) => {
  try {
    const { title, templet, phonebook, scheduleTimestamp, example } = req.body;

    if (!title || !templet?.name || !phonebook || !scheduleTimestamp) {
      return res.json({ success: false, msg: "Please enter all details" });
    }

    const { id } = phonebook;

    if (!id) {
      return res.json({ msg: "Invalid phonebook provided" });
    }

    const getMetaAPI = await query(`SELECT * FROM meta_api WHERE uid = ?`, [
      req.decode.uid,
    ]);

    if (getMetaAPI.length < 1) {
      return res.json({ msg: "We could not find your meta API keys" });
    }

    const getPhonebookContacts = await query(
      `SELECT * FROM contact where phonebook_id = ? AND uid = ?`,
      [id, req.decode.uid],
    );

    if (getPhonebookContacts.length < 1) {
      return res.json({
        success: false,
        msg: "The phonebook you have selected does not have any mobile number in it",
      });
    }

    const getMetaMobileDetails = await getMetaNumberDetail(
      "v18.0",
      getMetaAPI[0]?.business_phone_number_id,
      getMetaAPI[0]?.access_token,
    );

    if (getMetaMobileDetails.error) {
      return res.json({
        success: false,
        msg: "Either your meta API are invalid or your access token has been expired",
      });
    }

    const broadcast_id = randomstring.generate();

    const broadcast_logs = getPhonebookContacts.map((i) => [
      req.decode.uid,
      broadcast_id,
      templet?.name || "NA",
      getMetaMobileDetails?.display_phone_number,
      i?.mobile,
      "PENDING",
      JSON.stringify(example),
      JSON.stringify(i),
    ]);

    const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [
      req.decode.uid,
    ]);

    await query(
      `
                INSERT INTO broadcast_log (
                    uid,
                    broadcast_id,
                    templet_name,
                    sender_mobile,
                    send_to,
                    delivery_status,
                    example,
                    contact
                ) VALUES ?`,
      [broadcast_logs],
    );

    const scheduleDate = scheduleTimestamp ? new Date(scheduleTimestamp) : null;

    await query(
      `INSERT INTO broadcast (broadcast_id, uid, title, templet, phonebook, status, schedule, timezone) VALUES (
            ?,?,?,?,?,?,?,?
        )`,
      [
        broadcast_id,
        req.decode.uid,
        title,
        JSON.stringify(templet),
        JSON.stringify(phonebook),
        "QUEUE",
        scheduleDate,
        getUser[0]?.timezone || "Asia/Kolkata",
      ],
    );

    res.json({ success: true, msg: "Your broadcast has been added" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// get all campaign
router.get("/get_broadcast", validateUser, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM broadcast WHERE uid = ?`, [
      req.decode.uid,
    ]);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// get broadcast logs by bid
router.post("/get_broadcast_logs", validateUser, async (req, res) => {
  try {
    const { id } = req.body;

    const data = await query(
      `SELECT * FROM broadcast_log WHERE broadcast_id = ? AND uid = ?`,
      [id, req.decode.uid],
    );

    const getSent = data?.filter((i) => i.delivery_status === "sent");

    const totalDelivered = data?.filter(
      (i) => i.delivery_status === "delivered",
    );

    const totalRead = data?.filter((i) => i.delivery_status === "read");
    const totalFailed = data?.filter((i) => i.delivery_status === "failed");

    const totalPending = data?.filter((i) => i.delivery_status === "PENDING");

    console.log({
      totalLogs: data?.length,
      getSent: getSent?.length,
      totalRead: totalRead?.length,
      totalFailed: totalFailed?.length,
      totalPending: totalPending?.length,
      totalDelivered: totalDelivered?.length,
    });

    res.json({
      data,
      success: true,
      totalLogs: data?.length,
      getSent: getSent?.length,
      totalRead: totalRead?.length,
      totalFailed: totalFailed?.length,
      totalPending: totalPending?.length,
      totalDelivered: totalDelivered?.length,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// change campaign status
router.post("/change_broadcast_status", validateUser, async (req, res) => {
  try {
    console.log(req.body);
    const { status, broadcast_id } = req.body;

    if (!status) {
      return res.json({ msg: "Invalid request" });
    }

    await query(
      `UPDATE broadcast SET status = ? WHERE broadcast_id = ? AND uid = ?`,
      [status, broadcast_id, req.decode.uid],
    );
    res.json({ success: true, msg: "Campaign status updated" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// delete a broad cast
router.post("/del_broadcast", validateUser, async (req, res) => {
  try {
    const { broadcast_id } = req.body;

    await query(`DELETE FROM broadcast WHERE uid = ? AND broadcast_id = ?`, [
      req.decode.uid,
      broadcast_id,
    ]);
    await query(
      `DELETE FROM broadcast_log WHERE uid = ? AND broadcast_id = ?`,
      [req.decode.uid, broadcast_id],
    );

    res.json({ success: true, msg: "Broadcast was deleted" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post(
  "/create_template_campaign",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const {
        template_name,
        template_language,
        template_type,
        phonebook_id,
        campaign_title,
        body_variables,
        header_variable,
        button_variables,
        carousel_cards,
        schedule,
        timezone,
      } = req.body;

      // ── Validate required ─────────────────────────────────
      if (
        !template_name ||
        !template_language ||
        !phonebook_id ||
        !campaign_title
      ) {
        return res.json({ success: false, msg: "Missing required fields" });
      }

      // ── Carousel validation ───────────────────────────────
      if (template_type === "CAROUSEL") {
        if (!carousel_cards || carousel_cards.length < 2) {
          return res.json({
            success: false,
            msg: "Carousel requires at least 2 cards",
          });
        }
        if (carousel_cards.some((c) => !c.imageUrl)) {
          return res.json({
            success: false,
            msg: "All carousel cards must have an image",
          });
        }
      }

      // ── Get phonebook ─────────────────────────────────────
      const phonebooks = await query(
        "SELECT * FROM phonebook WHERE id = ? AND uid = ?",
        [phonebook_id, req.decode.uid],
      );
      if (!phonebooks || phonebooks.length === 0) {
        return res.json({ success: false, msg: "Phonebook not found" });
      }

      // ── Get contacts ──────────────────────────────────────
      const contacts = await query(
        `SELECT 
          mobile,
          MAX(name)  as name,
          MAX(var1)  as var1,
          MAX(var2)  as var2,
          MAX(var3)  as var3,
          MAX(var4)  as var4,
          MAX(var5)  as var5
        FROM contact
        WHERE phonebook_id = ? AND uid = ?
        GROUP BY mobile`,
        [phonebook_id, req.decode.uid],
      );
      if (!contacts || contacts.length === 0) {
        return res.json({
          success: false,
          msg: "No contacts found in phonebook",
        });
      }

      const campaignId = randomstring.generate(10);

      // ── Schedule ──────────────────────────────────────────
      let mysqlSchedule = null;
      if (schedule) {
        const d = new Date(schedule);
        if (!isNaN(d.getTime())) {
          mysqlSchedule = d.toISOString().slice(0, 19).replace("T", " ");
        }
      }

      let packedHeader;

      if (template_type === "CAROUSEL") {
        packedHeader = {
          type: "CAROUSEL",
          cards: carousel_cards.map((card) => ({
            imageUrl: card.imageUrl,
            bodyVariables: card.bodyVariables || [],
            buttonVariables: card.buttonVariables || [],
          })),
        };
      } else if (template_type === "CATALOG") {
        packedHeader = {
          type: "CATALOG",
          thumbnail: header_variable?.url || null,
        };
      } else {
        // STANDARD — preserve the original media type ("image"/"video"/"document")
        packedHeader = header_variable?.url
          ? {
              templateType: "STANDARD", // discriminator (won't clash with media type)
              type: header_variable.type || "image", // "image" | "video" | "document"
              url: header_variable.url || "",
              filename: header_variable.filename || "",
            }
          : null;
      }

      // ── Transaction ───────────────────────────────────────
      await query("START TRANSACTION");

      try {
        await query(
          `INSERT INTO beta_campaign (
            campaign_id, uid, title,
            template_name, template_language,
            phonebook_id, phonebook_name,
            status, total_contacts,
            body_variables,
            header_variable,
            button_variables,
            schedule, timezone
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`,
          [
            campaignId,
            req.decode.uid,
            campaign_title,
            template_name,
            template_language,
            phonebook_id,
            phonebooks[0].name,
            contacts.length,
            JSON.stringify(body_variables || []), // body vars
            JSON.stringify(packedHeader), // ← packed header
            JSON.stringify(button_variables || []), // button vars
            mysqlSchedule,
            timezone || null,
          ],
        );

        // ── Batch insert logs ─────────────────────────────
        const batchSize = 1000;
        for (let i = 0; i < contacts.length; i += batchSize) {
          const batch = contacts.slice(i, i + batchSize);
          const values = batch.map((contact) => [
            req.decode.uid,
            campaignId,
            contact.name || "NA",
            contact.mobile,
            "PENDING",
          ]);
          await query(
            `INSERT INTO beta_campaign_logs
             (uid, campaign_id, contact_name, contact_mobile, status)
             VALUES ?`,
            [values],
          );
        }

        await query("COMMIT");

        console.log(
          `✅ Campaign ${campaignId} | type: ${template_type || "STANDARD"} | contacts: ${contacts.length}`,
        );

        return res.json({
          success: true,
          msg: "Campaign created successfully",
          campaignId,
          totalContacts: contacts.length,
          templateType: template_type || "STANDARD",
        });
      } catch (err) {
        await query("ROLLBACK");
        throw err;
      }
    } catch (error) {
      console.error("Error creating campaign:", error);
      return res.json({ success: false, msg: "An error occurred" });
    }
  },
);

// Get all campaigns for the user
router.get("/get_campaigns", validateUser, checkPlan, async (req, res) => {
  try {
    const campaigns = await query(
      "SELECT * FROM beta_campaign WHERE uid = ? ORDER BY createdAt DESC",
      [req.decode.uid],
    );

    return res.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return res.json({
      success: false,
      msg: "An error occurred while fetching campaigns",
    });
  }
});

// Get campaign details including logs
router.get(
  "/get_campaign_details/:campaignId",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const { campaignId } = req.params;

      // Get campaign
      const campaigns = await query(
        "SELECT * FROM beta_campaign WHERE campaign_id = ? AND uid = ?",
        [campaignId, req.decode.uid],
      );

      if (!campaigns || campaigns.length === 0) {
        return res.json({
          success: false,
          msg: "Campaign not found",
        });
      }

      // Get logs
      const logs = await query(
        "SELECT * FROM beta_campaign_logs WHERE campaign_id = ? ORDER BY createdAt DESC",
        [campaignId],
      );

      return res.json({
        success: true,
        campaign: campaigns[0],
        logs,
      });
    } catch (error) {
      console.error("Error fetching campaign details:", error);
      return res.json({
        success: false,
        msg: "An error occurred while fetching campaign details",
      });
    }
  },
);

// // Get all campaigns for a user
// router.get("/campaigns", validateUser, async (req, res) => {
//   try {
//     const uid = req.decode.uid; // Note: Fixed typo from req.decode to req.decoded

//     const campaigns = await query(
//       `
//       SELECT
//         c.*,
//         COALESCE(c.sent_count, 0) as sent_count,
//         COALESCE(c.delivered_count, 0) as delivered_count,
//         COALESCE(c.read_count, 0) as read_count,
//         COALESCE(c.failed_count, 0) as failed_count,
//         p.name as phonebook_name
//       FROM beta_campaign c
//       LEFT JOIN phonebook p ON c.phonebook_id = p.id
//       WHERE c.uid = ?
//       ORDER BY c.createdAt DESC
//       LIMIT 50
//     `,
//       [uid]
//     );

//     res.json({ success: true, campaigns });
//   } catch (error) {
//     console.error("Error fetching campaigns:", error);
//     res
//       .status(500)
//       .json({ success: false, error: "Failed to fetch campaigns" });
//   }
// });

router.get("/campaigns", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = "WHERE c.uid = ?";
    let queryParams = [uid];

    if (status && status !== "") {
      whereClause += " AND c.status = ?";
      queryParams.push(status);
    }

    if (search && search !== "") {
      whereClause += " AND (c.title LIKE ? OR c.template_name LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Get total count for pagination
    const totalCountQuery = `
      SELECT COUNT(*) as total
      FROM beta_campaign c
      ${whereClause}
    `;
    const totalResult = await query(totalCountQuery, queryParams);
    const totalCampaigns = totalResult[0].total;

    // Get campaigns with updated counts
    const campaignsQuery = `
      SELECT 
        c.campaign_id,
        c.title,
        c.template_name,
        c.template_language,
        c.status,
        c.createdAt,
        c.schedule,
        c.total_contacts,
        c.sent_count,
        c.delivered_count,
        c.read_count,
        c.failed_count,
        p.name as phonebook_name
      FROM beta_campaign c
      LEFT JOIN phonebook p ON c.phonebook_id = p.id
      ${whereClause}
      ORDER BY c.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));
    const campaigns = await query(campaignsQuery, queryParams);

    res.json({
      success: true,
      campaigns,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCampaigns / limit),
        totalCampaigns,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch campaigns",
      details: error.message,
    });
  }
});

router.post("/download_csv", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: "Campaign ID is required",
      });
    }

    // Verify campaign belongs to user
    const campaignCheck = await query(
      "SELECT campaign_id FROM beta_campaign WHERE campaign_id = ? AND uid = ?",
      [campaignId, uid],
    );

    if (!campaignCheck || campaignCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Get all logs for the campaign
    const logs = await query(
      `SELECT 
        contact_name as 'Contact Name',
        contact_mobile as 'Phone Number',
        status as 'Send Status',
        delivery_status as 'Delivery Status',
        createdAt as 'Created Time',
        delivery_time as 'Sent Time',
        delivery_time as 'Delivery Time',
        error_message as 'Error Message',
        meta_msg_id as 'Message ID'
      FROM beta_campaign_logs
      WHERE campaign_id = ?
      ORDER BY createdAt DESC`,
      [campaignId],
    );

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("Error downloading CSV:", error);
    res.status(500).json({
      success: false,
      error: "Failed to download CSV",
      details: error.message,
    });
  }
});

// router.post("/download_csv", validateUser, async (req, res) => {
//   try {
//     const { campaignId } = req.body;
//     if (!campaignId) return res.json({ msg: "Please provide campaign ID" });
//     const logs = await query(
//       `
//       SELECT * FROM beta_campaign_logs
//       WHERE campaign_id = ?
//       ORDER BY createdAt DESC
//     `,
//       [campaignId]
//     );
//     res.json({ success: true, data: logs });
//   } catch (error) {
//     console.error("Error fetching campaigns:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to fetch campaigns",
//       msg: "Something went wrong",
//     });
//   }
// });

// // Get detailed stats for a specific campaign
// router.get("/campaign/:campaignId", validateUser, async (req, res) => {
//   try {
//     const uid = req.decode.uid;
//     const { campaignId } = req.params;

//     // Verify campaign belongs to user
//     const campaign = await query(
//       `
//       SELECT * FROM beta_campaign WHERE campaign_id = ? AND uid = ?
//     `,
//       [campaignId, uid]
//     );

//     if (!campaign || campaign.length === 0) {
//       return res
//         .status(404)
//         .json({ success: false, error: "Campaign not found" });
//     }

//     // Get detailed stats
//     const stats = await query(
//       `
//   SELECT
//     status,
//     delivery_status,
//     COUNT(*) as count,
//     DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00') as hour
//   FROM beta_campaign_logs
//   WHERE campaign_id = ?
//   GROUP BY status, delivery_status, hour
//   ORDER BY hour
// `,
//       [campaignId]
//     );

//     // Get recent logs
//     const logs = await query(
//       `
//       SELECT * FROM beta_campaign_logs
//       WHERE campaign_id = ?
//       ORDER BY createdAt DESC
//       LIMIT 100
//     `,
//       [campaignId]
//     );

//     // Calculate real-time counts more precisely
//     const counts = {
//       sent: 0,
//       delivered: 0,
//       read: 0,
//       failed: 0,
//       pending: 0,
//     };

//     stats.forEach((stat) => {
//       if (stat.status === "SENT") counts.sent += stat.count;
//       if (stat.delivery_status === "delivered") counts.delivered += stat.count;
//       if (stat.delivery_status === "read") counts.read += stat.count;
//       if (stat.status === "FAILED" || stat.delivery_status === "failed")
//         counts.failed += stat.count;
//       if (stat.status === "PENDING") counts.pending += stat.count;
//     });

//     // Ensure pending count is accurate by checking actual pending messages
//     const pendingCount = await query(
//       `SELECT COUNT(*) as count FROM beta_campaign_logs
//    WHERE campaign_id = ? AND status = 'PENDING'`,
//       [campaignId]
//     );

//     counts.pending = pendingCount[0].count || 0;

//     // Calculate real-time counts
//     const sentCount = stats.reduce((sum, stat) => {
//       return sum + (stat.status === "SENT" ? stat.count : 0);
//     }, 0);

//     const deliveredCount = stats.reduce((sum, stat) => {
//       return sum + (stat.delivery_status === "delivered" ? stat.count : 0);
//     }, 0);

//     const readCount = stats.reduce((sum, stat) => {
//       return sum + (stat.delivery_status === "read" ? stat.count : 0);
//     }, 0);

//     const failedCount = stats
//       .filter(
//         (stat) => stat.delivery_status === "failed" || stat.status === "FAILED"
//       )
//       .reduce((sum, stat) => sum + stat.count, 0);

//     res.json({
//       success: true,
//       campaign: {
//         ...campaign[0],
//         sent_count: sentCount,
//         delivered_count: deliveredCount,
//         read_count: readCount,
//         failed_count: failedCount,
//       },
//       stats,
//       logs,
//     });
//   } catch (error) {
//     console.error("Error fetching campaign details:", error);
//     res
//       .status(500)
//       .json({ success: false, error: "Failed to fetch campaign details" });
//   }
// });

router.get("/campaign/:campaignId", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { campaignId } = req.params;

    // Get campaign with updated counts
    const campaignQuery = `
      SELECT 
        c.*,
        p.name as phonebook_name
      FROM beta_campaign c
      LEFT JOIN phonebook p ON c.phonebook_id = p.id
      WHERE c.campaign_id = ? AND c.uid = ?
    `;

    const campaign = await query(campaignQuery, [campaignId, uid]);

    if (!campaign || campaign.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Get hourly stats for charts
    const stats = await query(
      `SELECT 
        DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00') as hour,
        status,
        delivery_status,
        COUNT(*) as count
      FROM beta_campaign_logs
      WHERE campaign_id = ?
      GROUP BY hour, status, delivery_status
      ORDER BY hour DESC`,
      [campaignId],
    );

    // Get recent logs (last 100)
    let logs = await query(
      `SELECT 
        id,
        contact_name,
        contact_mobile,
        status,
        delivery_status,
        createdAt,
        delivery_time,
        delivery_time,
        error_message,
        meta_msg_id
      FROM beta_campaign_logs
      WHERE campaign_id = ?
      ORDER BY createdAt DESC
      LIMIT 100`,
      [campaignId],
    );

    if (logs.length > 0) {
      logs = logs.map((x) => {
        return {
          ...x,
          campaign_id: campaignId,
        };
      });
    }

    // Get real-time accurate counts - FIXED: Added backticks around 'read'
    const realTimeCounts = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_status = 'read' THEN 1 ELSE 0 END) as \`read\`,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
      FROM beta_campaign_logs
      WHERE campaign_id = ?`,
      [campaignId],
    );

    // Update campaign object with real-time counts
    const updatedCampaign = {
      ...campaign[0],
      sent_count: parseInt(realTimeCounts[0]?.sent || 0),
      delivered_count: parseInt(realTimeCounts[0]?.delivered || 0),
      read_count: parseInt(realTimeCounts[0]?.read || 0),
      failed_count: parseInt(realTimeCounts[0]?.failed || 0),
      pending_count: parseInt(realTimeCounts[0]?.pending || 0),
      total_logs: parseInt(realTimeCounts[0]?.total || 0),
    };

    res.json({
      success: true,
      campaign: updatedCampaign,
      stats,
      logs,
    });
  } catch (error) {
    console.error("Error fetching campaign details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch campaign details",
      details: error.message,
    });
  }
});

// // Get dashboard summary stats
// router.get("/dashboard", validateUser, async (req, res) => {
//   try {
//     const uid = req.decode.uid;

//     // Get total campaigns
//     const totalCampaigns = await query(
//       `SELECT COUNT(*) as count FROM beta_campaign WHERE uid = ?`,
//       [uid]
//     );

//     // More comprehensive query for message stats from logs
//     const messageStats = await query(
//       `SELECT
//         COUNT(*) as total,
//         COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
//         COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as delivered,
//         COUNT(CASE WHEN delivery_status = 'read' THEN 1 END) as \`read\`,
//         COUNT(CASE WHEN
//           status = 'FAILED' OR
//           delivery_status = 'failed' OR
//           (error_message IS NOT NULL AND error_message != '') OR
//           status = 'ERROR' OR
//           status != 'SENT' AND status != 'SENT' -- Count anything not sent as potentially failed
//         THEN 1 END) as failed
//       FROM beta_campaign_logs
//       WHERE uid = ?`,
//       [uid]
//     );

//     // console.log("Message stats raw:", messageStats[0]);

//     // Format the final message stats - ensure they're all numbers, not strings
//     const finalMessageStats = {
//       sent: parseInt(messageStats[0].sent || 0),
//       delivered: parseInt(messageStats[0].delivered || 0),
//       read: parseInt(messageStats[0].read || 0),
//       failed: parseInt(messageStats[0].failed || 0),
//     };

//     // console.log("Final message stats:", finalMessageStats);

//     // Get campaigns by status
//     const campaignsByStatus = await query(
//       `SELECT status, COUNT(*) as count
//       FROM beta_campaign
//       WHERE uid = ?
//       GROUP BY status`,
//       [uid]
//     );

//     // Get daily stats for the last 30 days
//     const dailyStats = await query(
//       `SELECT
//         DATE(createdAt) as date,
//         COUNT(*) as total_messages,
//         SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
//         SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
//         SUM(CASE WHEN delivery_status = 'read' THEN 1 ELSE 0 END) as \`read\`,
//         SUM(CASE WHEN
//           status = 'FAILED' OR
//           delivery_status = 'failed' OR
//           (error_message IS NOT NULL AND error_message != '') OR
//           status = 'ERROR' OR
//           status != 'SENT'
//         THEN 1 ELSE 0 END) as failed
//       FROM beta_campaign_logs
//       WHERE uid = ? AND createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
//       GROUP BY DATE(createdAt)
//       ORDER BY date`,
//       [uid]
//     );

//     // Get recent campaigns with accurate failed counts from logs
//     const recentCampaigns = await query(
//       `SELECT
//         c.*,
//         p.name as phonebook_name,
//         (
//           SELECT COUNT(*)
//           FROM beta_campaign_logs
//           WHERE campaign_id = c.campaign_id
//           AND (
//             status = 'FAILED' OR
//             delivery_status = 'failed' OR
//             (error_message IS NOT NULL AND error_message != '') OR
//             status = 'ERROR'
//           )
//         ) as calculated_failed_count
//       FROM beta_campaign c
//       LEFT JOIN phonebook p ON c.phonebook_id = p.id
//       WHERE c.uid = ?
//       ORDER BY c.createdAt DESC
//       LIMIT 5`,
//       [uid]
//     );

//     // Update the failed_count in each campaign object with the calculated value
//     for (const campaign of recentCampaigns) {
//       campaign.failed_count = parseInt(campaign.calculated_failed_count || 0);
//       delete campaign.calculated_failed_count; // Remove the temporary field
//     }

//     res.json({
//       success: true,
//       totalCampaigns: totalCampaigns[0].count,
//       messageStats: finalMessageStats,
//       campaignsByStatus,
//       dailyStats,
//       recentCampaigns,
//     });
//   } catch (error) {
//     console.error("Error fetching dashboard data:", error);
//     res
//       .status(500)
//       .json({ success: false, error: "Failed to fetch dashboard data" });
//   }
// });

router.get("/dashboard", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;

    let totalCampaigns = 0;
    let betaCampaigns2 = [];
    let oldBroadcasts = [];
    
    // Try to get beta campaigns
    try {
      const betaCampaigns = await query(
        `SELECT COUNT(*) as count FROM beta_campaign WHERE uid = ?`,
        [uid],
      );
      totalCampaigns += betaCampaigns[0]?.count || 0;

      // Get recent beta campaigns
      betaCampaigns2 = await query(
        `SELECT 
          c.campaign_id,
          c.title,
          c.template_name,
          c.status,
          c.createdAt,
          c.total_contacts,
          c.sent_count,
          c.delivered_count,
          c.read_count,
          c.failed_count,
          p.name as phonebook_name
        FROM beta_campaign c
        LEFT JOIN phonebook p ON c.phonebook_id = p.id
        WHERE c.uid = ?
        ORDER BY c.createdAt DESC
        LIMIT 10`,
        [uid],
      );
    } catch (error) {
      console.log('Beta campaign table might not exist or query failed:', error.message);
    }

    // Try to get old broadcasts
    try {
      const oldCampaigns = await query(
        `SELECT COUNT(*) as count FROM broadcast WHERE uid = ?`,
        [uid],
      );
      totalCampaigns += oldCampaigns[0]?.count || 0;

      // Get recent old broadcasts
      oldBroadcasts = await query(
        `SELECT 
          b.broadcast_id as campaign_id,
          b.title,
          '' as template_name,
          b.status,
          b.createdAt,
          (SELECT COUNT(*) FROM broadcast_log WHERE broadcast_id = b.broadcast_id) as total_contacts,
          (SELECT COUNT(*) FROM broadcast_log WHERE broadcast_id = b.broadcast_id AND delivery_status = 'sent') as sent_count,
          (SELECT COUNT(*) FROM broadcast_log WHERE broadcast_id = b.broadcast_id AND delivery_status = 'delivered') as delivered_count,
          (SELECT COUNT(*) FROM broadcast_log WHERE broadcast_id = b.broadcast_id AND delivery_status = 'read') as read_count,
          (SELECT COUNT(*) FROM broadcast_log WHERE broadcast_id = b.broadcast_id AND delivery_status = 'failed') as failed_count,
          '' as phonebook_name
        FROM broadcast b
        WHERE b.uid = ?
        ORDER BY b.createdAt DESC
        LIMIT 10`,
        [uid],
      );
    } catch (error) {
      console.log('Broadcast table might not exist or query failed:', error.message);
    }

    // Get message stats
    let finalMessageStats = {
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
    };

    // Try beta_campaign_logs
    try {
      const betaMessageStats = await query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN delivery_status = 'read' THEN 1 ELSE 0 END) as \`read\`,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
        FROM beta_campaign_logs
        WHERE uid = ?`,
        [uid],
      );
      
      finalMessageStats.total += parseInt(betaMessageStats[0]?.total || 0);
      finalMessageStats.sent += parseInt(betaMessageStats[0]?.sent || 0);
      finalMessageStats.delivered += parseInt(betaMessageStats[0]?.delivered || 0);
      finalMessageStats.read += parseInt(betaMessageStats[0]?.read || 0);
      finalMessageStats.failed += parseInt(betaMessageStats[0]?.failed || 0);
      finalMessageStats.pending += parseInt(betaMessageStats[0]?.pending || 0);
    } catch (error) {
      console.log('Beta campaign logs query failed:', error.message);
    }

    // Try broadcast_log
    try {
      const oldMessageStats = await query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN delivery_status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN delivery_status = 'read' THEN 1 ELSE 0 END) as \`read\`,
          SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN delivery_status = 'PENDING' THEN 1 ELSE 0 END) as pending
        FROM broadcast_log
        WHERE uid = ?`,
        [uid],
      );

      finalMessageStats.total += parseInt(oldMessageStats[0]?.total || 0);
      finalMessageStats.sent += parseInt(oldMessageStats[0]?.sent || 0);
      finalMessageStats.delivered += parseInt(oldMessageStats[0]?.delivered || 0);
      finalMessageStats.read += parseInt(oldMessageStats[0]?.read || 0);
      finalMessageStats.failed += parseInt(oldMessageStats[0]?.failed || 0);
      finalMessageStats.pending += parseInt(oldMessageStats[0]?.pending || 0);
    } catch (error) {
      console.log('Broadcast log query failed:', error.message);
    }

    // Get campaigns by status
    let campaignsByStatus = [];
    const statusMap = new Map();
    
    try {
      const betaCampaignsByStatus = await query(
        `SELECT status, COUNT(*) as count
        FROM beta_campaign
        WHERE uid = ?
        GROUP BY status`,
        [uid],
      );
      betaCampaignsByStatus.forEach(item => {
        statusMap.set(item.status, (statusMap.get(item.status) || 0) + item.count);
      });
    } catch (error) {
      console.log('Beta campaign status query failed:', error.message);
    }

    try {
      const oldCampaignsByStatus = await query(
        `SELECT status, COUNT(*) as count
        FROM broadcast
        WHERE uid = ?
        GROUP BY status`,
        [uid],
      );
      oldCampaignsByStatus.forEach(item => {
        statusMap.set(item.status, (statusMap.get(item.status) || 0) + item.count);
      });
    } catch (error) {
      console.log('Old campaign status query failed:', error.message);
    }

    campaignsByStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    // Combine recent campaigns
    const allCampaigns = [...betaCampaigns2, ...oldBroadcasts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    console.log('Dashboard Stats:', {
      totalCampaigns,
      finalMessageStats,
      campaignsByStatus,
      recentCampaignsCount: allCampaigns.length
    });

    res.json({
      success: true,
      totalCampaigns,
      messageStats: finalMessageStats,
      campaignsByStatus,
      dailyStats: [],
      recentCampaigns: allCampaigns,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard data",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Test endpoint to check campaign data
router.get("/test-data", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    
    const results = {
      betaCampaigns: { exists: false, count: 0, sample: null },
      betaLogs: { exists: false, count: 0, sample: null, allLogs: [] },
      oldBroadcasts: { exists: false, count: 0, sample: null },
      oldLogs: { exists: false, count: 0, sample: null },
    };
    
    // Check beta_campaign
    try {
      const betaCampaigns = await query(`SELECT * FROM beta_campaign WHERE uid = ? ORDER BY createdAt DESC LIMIT 3`, [uid]);
      results.betaCampaigns.exists = true;
      results.betaCampaigns.count = betaCampaigns.length;
      results.betaCampaigns.sample = betaCampaigns;
    } catch (error) {
      results.betaCampaigns.error = error.message;
    }
    
    // Check beta_campaign_logs with MORE DETAIL
    try {
      const betaLogs = await query(`SELECT * FROM beta_campaign_logs WHERE uid = ? ORDER BY createdAt DESC LIMIT 5`, [uid]);
      results.betaLogs.exists = true;
      results.betaLogs.count = betaLogs.length;
      results.betaLogs.allLogs = betaLogs; // Show all recent logs
      results.betaLogs.sample = betaLogs[0] || null;
    } catch (error) {
      results.betaLogs.error = error.message;
    }
    
    // Check broadcast
    try {
      const oldBroadcasts = await query(`SELECT * FROM broadcast WHERE uid = ? LIMIT 1`, [uid]);
      results.oldBroadcasts.exists = true;
      results.oldBroadcasts.count = oldBroadcasts.length;
      results.oldBroadcasts.sample = oldBroadcasts[0] || null;
    } catch (error) {
      results.oldBroadcasts.error = error.message;
    }
    
    // Check broadcast_log
    try {
      const oldLogs = await query(`SELECT * FROM broadcast_log WHERE uid = ? LIMIT 1`, [uid]);
      results.oldLogs.exists = true;
      results.oldLogs.count = oldLogs.length;
      results.oldLogs.sample = oldLogs[0] || null;
    } catch (error) {
      results.oldLogs.error = error.message;
    }
    
    res.json({ success: true, uid, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create manual campaign (from SendCampaign with manual phone numbers)
router.post("/create_manual_campaign", validateUser, async (req, res) => {
  try {
    console.log('📥 Received create_manual_campaign request:', {
      hasCampaignName: !!req.body.campaign_name,
      hasTemplateName: !!req.body.template_name,
      resultsCount: req.body.results?.length || 0,
    });

    const { campaign_name, template_name, template_language, results } = req.body;
    const uid = req.decode.uid;

    if (!campaign_name || !template_name || !results || results.length === 0) {
      console.log('❌ Missing required fields for create_manual_campaign');
      return res.json({ success: false, msg: "Missing required fields" });
    }

    const campaignId = randomstring.generate(10);
    const totalContacts = results.length;
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    console.log('📊 Campaign stats:', {
      campaignId,
      totalContacts,
      successful: successfulResults.length,
      failed: failedResults.length,
    });

    // Insert campaign record
    await query(
      `INSERT INTO beta_campaign (
        campaign_id, uid, title,
        template_name, template_language,
        phonebook_id, phonebook_name,
        status, total_contacts,
        sent_count, failed_count,
        delivered_count, read_count,
        body_variables, header_variable, button_variables
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campaignId,
        uid,
        campaign_name,
        template_name,
        template_language || 'en_US',
        null, // no phonebook for manual campaigns
        'Manual Recipients',
        successfulResults.length > 0 ? 'COMPLETED' : 'FAILED',
        totalContacts,
        successfulResults.length,
        failedResults.length,
        0, // delivered_count - will be updated via webhooks
        0, // read_count - will be updated via webhooks
        '[]', // body_variables
        null, // header_variable
        '[]', // button_variables
      ]
    );

    console.log('✅ Campaign record created in beta_campaign');

    // Insert campaign logs
    const logValues = results.map(result => [
      uid,
      campaignId,
      result.contact_name || 'NA',
      result.recipient_phone,
      result.success ? 'SENT' : 'FAILED',
      result.meta_msg_id || null,
      result.success ? 'sent' : null,
      null, // delivery_time
      result.error || null,
    ]);

    if (logValues.length > 0) {
      await query(
        `INSERT INTO beta_campaign_logs (
          uid, campaign_id, contact_name, contact_mobile, 
          status, meta_msg_id, delivery_status, delivery_time, error_message
        ) VALUES ?`,
        [logValues]
      );
      console.log(`✅ Created ${logValues.length} log entries in beta_campaign_logs`);
    }

    console.log(`✅ Manual campaign ${campaignId} created | ${successfulResults.length}/${totalContacts} sent`);

    res.json({
      success: true,
      msg: "Campaign created successfully",
      campaignId,
      totalContacts,
      sentCount: successfulResults.length,
      failedCount: failedResults.length,
    });
  } catch (error) {
    console.error("❌ Error creating manual campaign:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to create campaign record",
      details: error.message,
    });
  }
});

// Export campaign logs to CSV
router.get("/export/:campaignId", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { campaignId } = req.params;

    // Verify campaign belongs to user
    const campaign = await query(
      `
      SELECT * FROM beta_campaign WHERE campaign_id = ? AND uid = ?
    `,
      [campaignId, uid],
    );

    if (!campaign || campaign.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    // Stream CSV instead of building entire string in memory
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign-${campaignId}.csv"`,
    );

    const fields = [
      "contact_name",
      "contact_mobile",
      "status",
      "delivery_status",
      "error_message",
      "createdAt",
      "delivery_time",
    ];

    res.write(fields.join(",") + "\n");

    const BATCH_SIZE = 500;
    let offset = 0;

    const sendBatch = async () => {
      const logs = await query(
        `
        SELECT 
          contact_name,
          contact_mobile,
          status,
          delivery_status,
          error_message,
          createdAt,
          delivery_time
        FROM beta_campaign_logs
        WHERE campaign_id = ?
        ORDER BY createdAt
        LIMIT ? OFFSET ?
      `,
        [campaignId, BATCH_SIZE, offset],
      );

      if (logs.length === 0) {
        res.end();
        return;
      }

      for (const log of logs) {
        const row = fields
          .map((field) => `"${(log[field] || "").toString().replace(/"/g, '""')}"`)
          .join(",");
        res.write(row + "\n");
      }

      offset += logs.length;
      if (logs.length >= BATCH_SIZE) {
        setImmediate(sendBatch);
      } else {
        res.end();
      }
    };

    await sendBatch();
  } catch (error) {
    console.error("Error exporting campaign data:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, error: "Failed to export campaign data" });
    }
  }
});

router.post("/del_campaign", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Campaign ID is required",
      });
    }

    // Verify campaign belongs to user
    const campaignCheck = await query(
      "SELECT campaign_id FROM beta_campaign WHERE campaign_id = ? AND uid = ?",
      [id, uid],
    );

    if (!campaignCheck || campaignCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Start transaction
    await query("START TRANSACTION");

    try {
      // Delete logs first (foreign key constraint)
      await query("DELETE FROM beta_campaign_logs WHERE campaign_id = ?", [id]);

      // Delete campaign
      await query(
        "DELETE FROM beta_campaign WHERE campaign_id = ? AND uid = ?",
        [id, uid],
      );

      // Commit transaction
      await query("COMMIT");

      res.json({
        success: true,
        message: "Campaign deleted successfully",
      });
    } catch (error) {
      // Rollback on error
      await query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete campaign",
      details: error.message,
    });
  }
});

// router.post("/del_campaign", validateUser, async (req, res) => {
//   try {
//     const { id } = req.body;
//     await query(`DELETE FROM beta_campaign WHERE campaign_id = ? AND uid = ?`, [
//       id,
//       req.decode.uid,
//     ]);
//     await query(
//       `DELETE FROM beta_campaign_logs WHERE campaign_id = ? AND uid = ?`,
//       [id, req.decode.uid]
//     );

//     res.json({ msg: "Campaign was deleted", success: true });
//   } catch (err) {
//     console.log(err);
//     res.json({ success: false, msg: "Something went wrong", err });
//   }
// });

// ✅ Get Meta templates for automation flow builder
router.get("/get-meta-templates", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    
    // Get Meta API credentials
    const [metaApi] = await query(
      `SELECT * FROM meta_api WHERE uid = ? LIMIT 1`,
      [uid]
    );
    
    if (!metaApi || !metaApi.access_token || !metaApi.waba_id) {
      return res.json({ 
        success: false, 
        msg: "Meta API credentials not found",
        data: []
      });
    }
    
    // Fetch templates from Meta API
    const fetch = require("node-fetch");
    const url = `https://graph.facebook.com/v18.0/${metaApi.waba_id}/message_templates?status=APPROVED&limit=100`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${metaApi.access_token}`,
      },
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.error("Meta API error:", result.error);
      return res.json({ 
        success: false, 
        msg: result.error.message || "Failed to fetch templates",
        data: []
      });
    }
    
    // Transform to expected format (M_ID, M_NAME)
    const templates = (result.data || []).map(template => ({
      M_ID: template.id,
      M_NAME: template.name,
      language: template.language,
      status: template.status,
      category: template.category,
      components: template.components || []
    }));
    
    res.json({ 
      success: true, 
      data: templates
    });
    
  } catch (err) {
    console.error("Error fetching Meta templates:", err);
    res.json({ 
      success: false, 
      msg: "Failed to fetch templates",
      data: []
    });
  }
});

// ✅ Get single template details for automation flow builder
router.get("/get-meta-template-details/:templateId", validateUser, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { templateId } = req.params;
    
    // Get Meta API credentials
    const [metaApi] = await query(
      `SELECT * FROM meta_api WHERE uid = ? LIMIT 1`,
      [uid]
    );
    
    if (!metaApi || !metaApi.access_token || !metaApi.waba_id) {
      return res.json({ 
        success: false, 
        msg: "Meta API credentials not found"
      });
    }
    
    // Fetch template details from Meta API
    const fetch = require("node-fetch");
    const url = `https://graph.facebook.com/v18.0/${templateId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${metaApi.access_token}`,
      },
    });
    
    const template = await response.json();
    
    if (template.error) {
      console.error("Meta API error:", template.error);
      return res.json({ 
        success: false, 
        msg: template.error.message || "Failed to fetch template details"
      });
    }
    
    res.json({ 
      success: true, 
      ...template
    });
    
  } catch (err) {
    console.error("Error fetching template details:", err);
    res.json({ 
      success: false, 
      msg: "Failed to fetch template details"
    });
  }
});

module.exports = router;
