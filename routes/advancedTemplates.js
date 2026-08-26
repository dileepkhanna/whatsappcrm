const router = require("express").Router();
const axios = require("axios");
const validateUser = require("../middlewares/user.js");
const { query } = require("../database/dbpromise.js");

// Get user's Meta API credentials
async function getMetaCredentials(uid) {
  const [metaApi] = await query(
    `SELECT * FROM meta_api WHERE uid = ? LIMIT 1`,
    [uid]
  );
  
  if (!metaApi || !metaApi.access_token || !metaApi.waba_id) {
    return null;
  }
  
  return metaApi;
}

// ============================================
// CAROUSEL TEMPLATE CREATION
// ============================================

router.post("/create_carousel_template", validateUser, async (req, res) => {
  try {
    const { templateName, cards, language, category } = req.body;
    
    console.log('📤 Creating carousel template:', templateName);
    
    // Validate input
    if (!templateName || !cards || cards.length === 0) {
      return res.json({
        success: false,
        msg: "Template name and cards are required"
      });
    }
    
    if (cards.length > 10) {
      return res.json({
        success: false,
        msg: "Maximum 10 cards allowed in carousel"
      });
    }
    
    // Get Meta credentials
    const metaApi = await getMetaCredentials(req.decode.uid);
    if (!metaApi) {
      return res.json({
        success: false,
        msg: "Meta API not configured or WABA ID missing. Please check your settings."
      });
    }
    
    // Build carousel template structure
    const templateData = {
      name: templateName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: language || "en_US",
      category: category || "MARKETING",
      components: [
        // Meta requires a top-level BODY component for carousel templates
        {
          type: "BODY",
          text: "Check out our products:"
        },
        {
          type: "CAROUSEL",
          cards: cards.map(card => {
            const cardComponents = [];
            
            // Header (Image)
            if (card.imageUrl) {
              cardComponents.push({
                type: "HEADER",
                format: "IMAGE",
                example: {
                  header_handle: [card.imageUrl]
                }
              });
            }
            
            // Body with variables
            const bodyComponent = {
              type: "BODY",
              text: card.bodyText || "Product information"
            };
            
            // Only add example if there are actual example values
            if (card.exampleValues && card.exampleValues.length > 0) {
              bodyComponent.example = {
                body_text: [card.exampleValues]
              };
            }
            
            cardComponents.push(bodyComponent);
            
            // Buttons (Meta requires at least 1 button per card)
            if (card.buttons && card.buttons.length > 0) {
              cardComponents.push({
                type: "BUTTONS",
                buttons: card.buttons.map(btn => ({
                  type: btn.type || "QUICK_REPLY",
                  text: btn.text
                }))
              });
            } else {
              // Auto-add default button if none provided
              cardComponents.push({
                type: "BUTTONS",
                buttons: [{
                  type: "QUICK_REPLY",
                  text: "View Details"
                }]
              });
            }
            
            return { components: cardComponents };
          })
        }
      ]
    };
    
    console.log('📦 Template payload:', JSON.stringify(templateData, null, 2));
    
    // Call Meta API
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${metaApi.waba_id}/message_templates`,
      templateData,
      {
        headers: {
          'Authorization': `Bearer ${metaApi.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Carousel template created:', response.data);
    
    res.json({
      success: true,
      msg: "Carousel template created successfully! Wait for Meta approval (usually 15 min - 24 hours).",
      data: response.data
    });
    
  } catch (err) {
    console.error("❌ Carousel template creation error:", err.response?.data || err.message);
    res.json({
      success: false,
      msg: err.response?.data?.error?.message || "Failed to create carousel template",
      error: err.response?.data
    });
  }
});

// ============================================
// CATALOG TEMPLATE CREATION
// ============================================

router.post("/create_catalog_template", validateUser, async (req, res) => {
  try {
    const { templateName, bodyText, language, category } = req.body;
    
    console.log('📤 Creating catalog template:', templateName);
    
    // Validate input
    if (!templateName || !bodyText) {
      return res.json({
        success: false,
        msg: "Template name and body text are required"
      });
    }
    
    // Get Meta credentials
    const metaApi = await getMetaCredentials(req.decode.uid);
    if (!metaApi) {
      return res.json({
        success: false,
        msg: "Meta API not configured or WABA ID missing"
      });
    }
    
    // Build catalog template structure
    const templateData = {
      name: templateName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: language || "en_US",
      category: category || "MARKETING",
      components: [
        {
          type: "BODY",
          text: bodyText
        },
        {
          type: "CATALOG",
          example: {
            products: [
              {
                product_retailer_id: "sample_product_1"
              }
            ]
          }
        }
      ]
    };
    
    console.log('📦 Catalog template payload:', JSON.stringify(templateData, null, 2));
    
    // Call Meta API
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${metaApi.waba_id}/message_templates`,
      templateData,
      {
        headers: {
          'Authorization': `Bearer ${metaApi.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Catalog template created:', response.data);
    
    res.json({
      success: true,
      msg: "Catalog template created successfully! Make sure you have a product catalog linked to your WhatsApp Business Account.",
      data: response.data
    });
    
  } catch (err) {
    console.error("❌ Catalog template creation error:", err.response?.data || err.message);
    res.json({
      success: false,
      msg: err.response?.data?.error?.message || "Failed to create catalog template",
      error: err.response?.data
    });
  }
});

// ============================================
// GET WABA ID
// ============================================

router.get("/get_waba_id", validateUser, async (req, res) => {
  try {
    const [metaApi] = await query(
      `SELECT waba_id, business_phone_number_id FROM meta_api WHERE uid = ? LIMIT 1`,
      [req.decode.uid]
    );
    
    if (!metaApi) {
      return res.json({
        success: false,
        msg: "Meta API not configured"
      });
    }
    
    res.json({
      success: true,
      waba_id: metaApi.waba_id || null,
      phone_number_id: metaApi.business_phone_number_id || null,
      has_waba: !!metaApi.waba_id
    });
    
  } catch (err) {
    console.error("Error fetching WABA ID:", err);
    res.json({ 
      success: false, 
      msg: "Error fetching WABA ID" 
    });
  }
});

// ============================================
// UPDATE WABA ID
// ============================================

router.post("/update_waba_id", validateUser, async (req, res) => {
  try {
    const { waba_id } = req.body;
    
    if (!waba_id) {
      return res.json({
        success: false,
        msg: "WABA ID is required"
      });
    }
    
    await query(
      `UPDATE meta_api SET waba_id = ? WHERE uid = ?`,
      [waba_id, req.decode.uid]
    );
    
    res.json({
      success: true,
      msg: "WABA ID updated successfully"
    });
    
  } catch (err) {
    console.error("Error updating WABA ID:", err);
    res.json({
      success: false,
      msg: "Failed to update WABA ID"
    });
  }
});

// ============================================
// GET WABA ID FROM META API (Helper)
// ============================================

router.get("/fetch_waba_id_from_meta", validateUser, async (req, res) => {
  try {
    const [metaApi] = await query(
      `SELECT access_token, business_phone_number_id FROM meta_api WHERE uid = ? LIMIT 1`,
      [req.decode.uid]
    );
    
    if (!metaApi || !metaApi.access_token) {
      return res.json({
        success: false,
        msg: "Meta API access token not found"
      });
    }
    
    // Get WABA ID from phone number ID
    const response = await axios.get(
      `https://graph.facebook.com/v21.0/${metaApi.business_phone_number_id}?fields=account_mode,business_id,id,messaging_limit_tier,name,name_status,quality_rating,verified_name,display_phone_number,certificate,code_verification_status,eligibility_for_api_business_global_search,is_official_business_account,is_pin_enabled,account_review_status`,
      {
        headers: {
          'Authorization': `Bearer ${metaApi.access_token}`
        }
      }
    );
    
    const wabaId = response.data.id;
    
    // Save to database
    await query(
      `UPDATE meta_api SET waba_id = ? WHERE uid = ?`,
      [wabaId, req.decode.uid]
    );
    
    res.json({
      success: true,
      msg: "WABA ID fetched and saved successfully",
      waba_id: wabaId
    });
    
  } catch (err) {
    console.error("Error fetching WABA ID from Meta:", err.response?.data || err.message);
    res.json({
      success: false,
      msg: "Failed to fetch WABA ID from Meta API",
      error: err.response?.data
    });
  }
});

module.exports = router;
