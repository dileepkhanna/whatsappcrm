const router = require("express").Router();
const { query } = require("../database/dbpromise");
const validateUser = require("../middlewares/user");

// ========================================
// Get all automation flows for user
// ========================================
router.get("/flows", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;

    const flows = await query(
      `SELECT 
        id,
        name,
        description,
        flow_id,
        status,
        trigger_type,
        trigger_value,
        flow_data,
        created_at,
        updated_at
      FROM automation_flows 
      WHERE user_id = ?
      ORDER BY created_at DESC`,
      [userId]
    );

    // Get stats for each flow
    for (let flow of flows) {
      const stats = await query(
        `SELECT 
          COUNT(*) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as \`read\`,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM flow_executions 
        WHERE flow_id = ?`,
        [flow.id]
      );
      flow.stats = stats[0] || { sent: 0, delivered: 0, read: 0, completed: 0 };
      
      // Parse flow_data if it's a string
      if (typeof flow.flow_data === 'string') {
        try {
          flow.flow_data = JSON.parse(flow.flow_data);
        } catch (e) {
          flow.flow_data = null;
        }
      }
    }

    res.json({
      success: true,
      data: flows,
      msg: "Flows retrieved successfully"
    });
  } catch (error) {
    console.error("Error fetching automation flows:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch automation flows",
      error: error.message
    });
  }
});

// ========================================
// Get single flow
// ========================================
router.get("/flows/:id", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const flowId = req.params.id;

    const flows = await query(
      `SELECT * FROM automation_flows 
      WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    if (flows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Flow not found"
      });
    }

    const flow = flows[0];
    
    // Parse flow_data if it's a string
    if (typeof flow.flow_data === 'string') {
      try {
        flow.flow_data = JSON.parse(flow.flow_data);
      } catch (e) {
        flow.flow_data = null;
      }
    }

    // Get stats
    const stats = await query(
      `SELECT 
        COUNT(*) as sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as \`read\`,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM flow_executions 
      WHERE flow_id = ?`,
      [flowId]
    );
    flow.stats = stats[0] || { sent: 0, delivered: 0, read: 0, completed: 0 };

    res.json({
      success: true,
      data: flow,
      msg: "Flow retrieved successfully"
    });
  } catch (error) {
    console.error("Error fetching flow:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch flow",
      error: error.message
    });
  }
});

// ========================================
// Create new flow
// ========================================
router.post("/flows", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const {
      name,
      description,
      flow_id,
      trigger_type,
      trigger_value,
      status = 'draft',
      flow_data
    } = req.body;

    if (!name || !trigger_type) {
      return res.status(400).json({
        success: false,
        msg: "Name and trigger type are required"
      });
    }

    const flowDataString = flow_data ? JSON.stringify(flow_data) : null;

    const result = await query(
      `INSERT INTO automation_flows 
      (user_id, name, description, flow_id, trigger_type, trigger_value, status, flow_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [userId, name, description || null, flow_id || null, trigger_type, trigger_value || null, status, flowDataString]
    );

    res.json({
      success: true,
      data: {
        id: result.insertId,
        name,
        description,
        flow_id,
        trigger_type,
        trigger_value,
        status,
        flow_data
      },
      msg: "Flow created successfully"
    });
  } catch (error) {
    console.error("Error creating flow:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to create flow",
      error: error.message
    });
  }
});

// ========================================
// Update flow
// ========================================
router.put("/flows/:id", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const flowId = req.params.id;
    const {
      name,
      description,
      flow_id,
      trigger_type,
      trigger_value,
      status,
      flow_data
    } = req.body;

    // Check if flow exists and belongs to user
    const flows = await query(
      `SELECT id FROM automation_flows WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    if (flows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Flow not found"
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (flow_id !== undefined) {
      updates.push('flow_id = ?');
      values.push(flow_id);
    }
    if (trigger_type !== undefined) {
      updates.push('trigger_type = ?');
      values.push(trigger_type);
    }
    if (trigger_value !== undefined) {
      updates.push('trigger_value = ?');
      values.push(trigger_value);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (flow_data !== undefined) {
      updates.push('flow_data = ?');
      values.push(JSON.stringify(flow_data));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        msg: "No fields to update"
      });
    }

    updates.push('updated_at = NOW()');
    values.push(flowId, userId);

    await query(
      `UPDATE automation_flows SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    res.json({
      success: true,
      msg: "Flow updated successfully"
    });
  } catch (error) {
    console.error("Error updating flow:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to update flow",
      error: error.message
    });
  }
});

// ========================================
// Delete flow
// ========================================
router.delete("/flows/:id", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const flowId = req.params.id;

    // Check if flow exists and belongs to user
    const flows = await query(
      `SELECT id FROM automation_flows WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    if (flows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Flow not found"
      });
    }

    // Delete flow executions first (foreign key constraint)
    await query(
      `DELETE FROM flow_executions WHERE flow_id = ?`,
      [flowId]
    );

    // Delete the flow
    await query(
      `DELETE FROM automation_flows WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    res.json({
      success: true,
      msg: "Flow deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting flow:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to delete flow",
      error: error.message
    });
  }
});

// ========================================
// Toggle flow status
// ========================================
router.patch("/flows/:id/status", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const flowId = req.params.id;
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        msg: "Valid status required (active, inactive, draft)"
      });
    }

    // Check if flow exists and belongs to user
    const flows = await query(
      `SELECT id FROM automation_flows WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    if (flows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Flow not found"
      });
    }

    await query(
      `UPDATE automation_flows SET status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`,
      [status, flowId, userId]
    );

    res.json({
      success: true,
      msg: `Flow ${status === 'active' ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error("Error updating flow status:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to update flow status",
      error: error.message
    });
  }
});

// ========================================
// Get flow stats
// ========================================
router.get("/flows/:id/stats", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const flowId = req.params.id;

    // Check if flow exists and belongs to user
    const flows = await query(
      `SELECT id FROM automation_flows WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    if (flows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Flow not found"
      });
    }

    const stats = await query(
      `SELECT 
        COUNT(*) as total_executions,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as \`read\`,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM flow_executions 
      WHERE flow_id = ?`,
      [flowId]
    );

    res.json({
      success: true,
      data: stats[0] || { total_executions: 0, sent: 0, delivered: 0, read: 0, completed: 0, failed: 0 },
      msg: "Stats retrieved successfully"
    });
  } catch (error) {
    console.error("Error fetching flow stats:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to fetch flow stats",
      error: error.message
    });
  }
});

// ========================================
// Sync flows from Meta
// ========================================
router.post("/flows/sync", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;

    // Get user's Meta credentials
    const users = await query(
      `SELECT waba_id, access_token, phone_number_id FROM user WHERE id = ?`,
      [userId]
    );

    if (users.length === 0 || !users[0].access_token) {
      return res.status(400).json({
        success: false,
        msg: "Meta WhatsApp credentials not configured"
      });
    }

    const { waba_id, access_token } = users[0];

    // TODO: Make API call to Meta to fetch flows
    // This is a placeholder - implement actual Meta API integration
    
    res.json({
      success: true,
      msg: "Flows synced successfully (placeholder)",
      data: []
    });
  } catch (error) {
    console.error("Error syncing flows:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to sync flows from Meta",
      error: error.message
    });
  }
});

// ========================================
// Test flow
// ========================================
router.post("/flows/:id/test", validateUser, async (req, res) => {
  try {
    const userId = req.decode.userData.id;
    const flowId = req.params.id;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        msg: "Phone number is required"
      });
    }

    // Check if flow exists and belongs to user
    const flows = await query(
      `SELECT * FROM automation_flows WHERE id = ? AND user_id = ?`,
      [flowId, userId]
    );

    if (flows.length === 0) {
      return res.status(404).json({
        success: false,
        msg: "Flow not found"
      });
    }

    // TODO: Implement actual flow testing logic
    // This would send a test message with the flow to the provided phone number

    res.json({
      success: true,
      msg: "Test flow sent successfully (placeholder)"
    });
  } catch (error) {
    console.error("Error testing flow:", error);
    res.status(500).json({
      success: false,
      msg: "Failed to test flow",
      error: error.message
    });
  }
});

module.exports = router;
