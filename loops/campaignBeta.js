const { query } = require("../database/dbpromise");
const { sendTemplateMessage } = require("../functions/function");
const moment = require("moment-timezone");

// Simple processing flags
const processingCampaigns = new Set();

// Configuration
const CONFIG = {
  batchSize: 20,
  checkInterval: 30000,
  messageDelay: 300,
  maxRetries: 3,
  retryDelay: 5000,
};

function hasDatePassedInTimezone(timezone, date) {
  const tz = timezone || "UTC";
  const momentDate = moment.tz(date, tz);
  const currentMoment = moment.tz(tz);
  return momentDate.isBefore(currentMoment);
}

async function initCampaign() {
  await handleLegacyCampaigns();

  const interval = setInterval(async () => {
    try {
      await processPendingCampaigns();
    } catch (error) {
      console.error("Error in campaign processing loop:", error);
    }
  }, CONFIG.checkInterval);

  setTimeout(() => processPendingCampaigns(), 1000);

  return interval;
}

/**
 * Handle legacy campaigns - mark them as COMPLETED if no logs
 * ✅ FIX: Skip campaigns that have a future schedule — they are not legacy,
 *         they are simply waiting to fire.
 */
async function handleLegacyCampaigns() {
  try {
    const legacyCampaigns = await query(
      `SELECT c.campaign_id, c.title, c.schedule, c.timezone
       FROM beta_campaign c
       LEFT JOIN beta_campaign_logs l ON c.campaign_id = l.campaign_id
       WHERE c.status IN ('PENDING', 'IN_PROGRESS')
       AND l.campaign_id IS NULL
       AND (c.schedule IS NULL OR c.schedule = '' OR c.schedule = '0000-00-00 00:00:00')`,
      [],
    );

    if (legacyCampaigns.length > 0) {
      for (const campaign of legacyCampaigns) {
        await query(
          `UPDATE beta_campaign 
           SET status = 'COMPLETED' 
           WHERE campaign_id = ?`,
          [campaign.campaign_id],
        );
      }
    }
  } catch (error) {
    console.error("Error handling legacy campaigns:", error);
  }
}

async function processPendingCampaigns() {
  try {
    const campaigns = await query(
      `SELECT * FROM beta_campaign 
       WHERE (status = 'PENDING' OR status = 'IN_PROGRESS')
       ORDER BY createdAt ASC
       LIMIT 10`,
      [],
    );

    if (!campaigns || campaigns.length === 0) {
      return;
    }

    for (const campaign of campaigns) {
      if (campaign.schedule) {
        const tz = campaign.timezone || "UTC";
        if (!hasDatePassedInTimezone(tz, campaign.schedule)) {
          continue;
        }
      }

      if (processingCampaigns.has(campaign.campaign_id)) {
        continue;
      }

      processingCampaigns.add(campaign.campaign_id);

      try {
        await processSingleCampaign(campaign);
      } catch (error) {
        console.error(
          `Error processing campaign ${campaign.campaign_id}:`,
          error,
        );
      } finally {
        processingCampaigns.delete(campaign.campaign_id);
      }
    }
  } catch (error) {
    console.error("Error in processPendingCampaigns:", error);
  }
}

async function sendCarouselTemplateMessage(
  apiVersion,
  phoneNumberId,
  accessToken,
  templateName,
  language,
  recipientPhone,
  globalBodyVariables = [],
  cardCount = 2,
  templateStructure = null,
) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  // 🎨 CAROUSEL TEMPLATES: Per Meta's documentation
  // We need to send carousel component with card_index for each card
  // Images are baked into template, so NO header parameters needed
  
  const components = [];
  
  // Add global body component if there are variables
  if (globalBodyVariables.length > 0) {
    components.push({
      type: "body",
      parameters: globalBodyVariables.map((v) => ({
        type: "text",
        text: String(v || ""),
      })),
    });
  }

  // Build carousel component
  // For carousel templates: each card has HEADER (image) and BODY components
  // Images are baked into template, so we send empty parameters for header
  const carouselCards = [];
  
  for (let i = 0; i < cardCount; i++) {
    const cardComponents = [];
    
    // Add header component with NO parameters (image is baked into template)
    // Meta requires header component to be present but with empty parameters array
    cardComponents.push({
      type: "header",
      parameters: [], // Empty - image is from template definition
    });
    
    // Add body component with NO parameters (text is baked into template)
    cardComponents.push({
      type: "body",
      parameters: [], // Empty - body text is from template definition
    });
    
    carouselCards.push({
      card_index: i,
      components: cardComponents,
    });
  }
  
  components.push({
    type: "carousel",
    cards: carouselCards,
  });
  
  const payload = {
    messaging_product: "whatsapp",
    to: recipientPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };

  console.log(`🎨 Sending carousel template with ${cardCount} cards:`, JSON.stringify(payload, null, 2));

  try {
    console.log(`🌐 Sending request to: https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    const result = await response.json();
    console.log('📨 Meta API Response:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("Error sending carousel template:", error);
    throw error;
  }
}

async function sendCatalogTemplateMessage(
  apiVersion,
  phoneNumberId,
  accessToken,
  templateName,
  language,
  recipientPhone,
  bodyVariables = [],
  thumbnailProductRetailerId = null,
) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const components = [];

  if (bodyVariables.length > 0) {
    components.push({
      type: "body",
      parameters: bodyVariables.map((v) => ({
        type: "text",
        text: String(v || ""),
      })),
    });
  }

  components.push({
    type: "button",
    sub_type: "CATALOG",
    index: 0,
    parameters: [
      {
        type: "action",
        action: thumbnailProductRetailerId
          ? { thumbnail_product_retailer_id: thumbnailProductRetailerId }
          : {},
      },
    ],
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error("Error sending catalog template:", error);
    throw error;
  }
}

async function processSingleCampaign(campaign) {
  if (campaign.status === "PENDING") {
    await query(
      "UPDATE beta_campaign SET status = 'IN_PROGRESS' WHERE campaign_id = ?",
      [campaign.campaign_id],
    );
  }

  const pendingLogs = await query(
    `SELECT * FROM beta_campaign_logs 
     WHERE campaign_id = ? 
     AND status = 'PENDING'
     ORDER BY id ASC
     LIMIT ?`,
    [campaign.campaign_id, CONFIG.batchSize],
  );

  if (!pendingLogs || pendingLogs.length === 0) {
    await checkAndMarkCampaignComplete(campaign);
    return;
  }

  const metaCredentials = await query(
    "SELECT * FROM meta_api WHERE uid = ? LIMIT 1",
    [campaign.uid],
  );

  if (!metaCredentials || metaCredentials.length === 0) {
    await query(
      `UPDATE beta_campaign_logs 
       SET status = 'FAILED', error_message = 'Meta API credentials not found'
       WHERE campaign_id = ? AND status = 'PENDING'`,
      [campaign.campaign_id],
    );
    await updateCampaignCounts(campaign.campaign_id);
    await checkAndMarkCampaignComplete(campaign);
    return;
  }

  let bodyVariables = [];
  let headerVariable = null;
  let buttonVariables = [];

  try {
    bodyVariables = campaign.body_variables
      ? JSON.parse(campaign.body_variables)
      : [];
    headerVariable = campaign.header_variable
      ? JSON.parse(campaign.header_variable)
      : null;
    buttonVariables = campaign.button_variables
      ? JSON.parse(campaign.button_variables)
      : [];
  } catch (e) {
    console.error(`Error parsing campaign variables: ${e.message}`);
  }

  // 🔍 Auto-detect template type if header_variable is null
  // This handles campaigns created without specifying template type
  let templateType = "STANDARD";
  
  if (headerVariable?.type === "CAROUSEL") {
    templateType = "CAROUSEL";
  } else if (headerVariable?.type === "CATALOG") {
    templateType = "CATALOG";
  } else if (!headerVariable || headerVariable === null) {
    // Fetch template from Meta to detect type
    try {
      const { getAllTempletsMeta } = require("../functions/function");
      const templatesResponse = await getAllTempletsMeta(
        "v18.0",
        metaCredentials[0].waba_id,
        metaCredentials[0].access_token
      );
      
      if (templatesResponse && templatesResponse.data) {
        const matchingTemplate = templatesResponse.data.find(
          t => t.name === campaign.template_name
        );
        
        if (matchingTemplate && matchingTemplate.components) {
          // Check if template has CAROUSEL component
          const hasCarousel = matchingTemplate.components.some(
            c => c.type === "CAROUSEL"
          );
          const hasCatalog = matchingTemplate.components.some(
            c => c.type === "BUTTONS" && c.buttons?.some(b => b.type === "CATALOG")
          );
          
          if (hasCarousel) {
            templateType = "CAROUSEL";
            console.log(`🎨 Auto-detected CAROUSEL template: ${campaign.template_name}`);
          } else if (hasCatalog) {
            templateType = "CATALOG";
            console.log(`🛍️ Auto-detected CATALOG template: ${campaign.template_name}`);
          }
        }
      }
    } catch (detectError) {
      console.error(`⚠️ Failed to auto-detect template type:`, detectError.message);
      // Continue with STANDARD type
    }
  }

  const credentials = metaCredentials[0];
  const successfulIds = [];
  const failedUpdates = [];

  for (const log of pendingLogs) {
    try {
      const contact = await getContactForLog(log, campaign);

      let result;

      if (templateType === "CAROUSEL") {
        const cards = (headerVariable.cards || []).map((card) => ({
          imageUrl: card.imageUrl,
          bodyVariables: replaceContactVariables(
            card.bodyVariables || [],
            contact,
          ),
          buttonVariables: replaceContactVariables(
            card.buttonVariables || [],
            contact,
          ),
        }));

        result = await sendCarouselTemplateMessage(
          "v18.0",
          credentials.business_phone_number_id,
          credentials.access_token,
          campaign.template_name,
          campaign.template_language,
          log.contact_mobile,
          replaceContactVariables(bodyVariables, contact),
          cards,
        );
      } else if (templateType === "CATALOG") {
        const processedBodyVars = replaceContactVariables(
          bodyVariables,
          contact,
        );

        result = await sendCatalogTemplateMessage(
          "v18.0",
          credentials.business_phone_number_id,
          credentials.access_token,
          campaign.template_name,
          campaign.template_language,
          log.contact_mobile,
          processedBodyVars,
          headerVariable.thumbnail || null,
        );
      } else {
        const processedBodyVars = replaceContactVariables(
          bodyVariables,
          contact,
        );
        const processedHeaderVar = replaceContactVariable(
          headerVariable,
          contact,
        );
        const processedButtonVars = replaceContactVariables(
          buttonVariables,
          contact,
        );

        result = await sendTemplateMessage(
          "v18.0",
          credentials.business_phone_number_id,
          credentials.access_token,
          campaign.template_name,
          campaign.template_language,
          log.contact_mobile,
          processedBodyVars,
          processedHeaderVar,
          processedButtonVars,
        );
      }

      if (result && result.messages && result.messages.length > 0) {
        successfulIds.push({ id: log.id, messageId: result.messages[0].id });
        
        // ✅ FIX: Create or update chat entry in beta_chats when campaign message is sent
        try {
          // Check if chat already exists
          const chatId = `meta_${log.contact_mobile}_${campaign.uid}`;
          const existingChat = await query(
            `SELECT chat_id FROM beta_chats WHERE chat_id = ? LIMIT 1`,
            [chatId]
          );
          
          const lastMessagePayload = {
            type: "template",
            metaChatId: result.messages[0].id,
            msgContext: {
              type: "template",
              template: {
                name: campaign.template_name,
                language: campaign.template_language
              }
            },
            reaction: "",
            timestamp: Math.floor(Date.now() / 1000),
            senderName: credentials.business_phone_number_id,
            senderMobile: credentials.business_phone_number_id,
            star: "0",
            route: "OUTGOING",
            context: null,
            origin: "meta"
          };
          
          if (existingChat.length === 0) {
            // Create new chat entry
            await query(
              `INSERT INTO beta_chats 
               (uid, chat_id, sender_mobile, sender_name, last_message, origin, unread_count, createdAt, updatedAt) 
               VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                campaign.uid,
                chatId,
                log.contact_mobile,
                log.contact_name || log.contact_mobile,
                JSON.stringify(lastMessagePayload),
                'meta',
                0
              ]
            );
            console.log(`✅ Created new chat entry for campaign: ${chatId}`);
          } else {
            // Update existing chat
            await query(
              `UPDATE beta_chats 
               SET last_message = ?, updatedAt = NOW() 
               WHERE chat_id = ?`,
              [JSON.stringify(lastMessagePayload), chatId]
            );
            console.log(`✅ Updated existing chat entry for campaign: ${chatId}`);
          }
          
          // Also create conversation entry for tracking
          await query(
            `INSERT INTO beta_conversation 
             (type, chat_id, uid, status, metaChatId, msgContext, reaction, timestamp, senderName, senderMobile, star, route, context, origin, sentBy, createdAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              'template',
              chatId,
              campaign.uid,
              null,
              result.messages[0].id,
              JSON.stringify({
                type: "template",
                template: {
                  name: campaign.template_name,
                  language: campaign.template_language
                }
              }),
              '',
              Math.floor(Date.now() / 1000),
              credentials.business_phone_number_id,
              credentials.business_phone_number_id,
              '0',
              'OUTGOING',
              null,
              'meta',
              'bot'
            ]
          );
          console.log(`✅ Created conversation entry for: ${chatId}`);
        } catch (chatError) {
          console.error(`Error creating/updating chat for ${log.contact_mobile}:`, chatError.message);
          // Don't fail the entire campaign send if chat creation fails
        }
      } else {
        const errorMsg = result?.error?.message || "No message ID returned";
        failedUpdates.push({ id: log.id, error: errorMsg });
      }

      await new Promise((resolve) => setTimeout(resolve, CONFIG.messageDelay));
    } catch (error) {
      console.error(`Error sending to ${log.contact_mobile}:`, error.message);
      failedUpdates.push({ id: log.id, error: error.message });
    }
  }

  if (successfulIds.length > 0) {
    for (const success of successfulIds) {
      await query(
        `UPDATE beta_campaign_logs 
         SET status = 'SENT', meta_msg_id = ?, delivery_time = NOW()
         WHERE id = ?`,
        [success.messageId, success.id],
      );
    }
  }

  if (failedUpdates.length > 0) {
    for (const failed of failedUpdates) {
      await query(
        `UPDATE beta_campaign_logs 
         SET status = 'FAILED', error_message = ?
         WHERE id = ?`,
        [failed.error, failed.id],
      );
    }
  }

  await updateCampaignCounts(campaign.campaign_id);
  await checkAndMarkCampaignComplete(campaign);
}

async function getContactForLog(log, campaign) {
  const contacts = await query(
    `SELECT * FROM contact 
     WHERE mobile = ? AND uid = ? AND phonebook_id = ?
     LIMIT 1`,
    [log.contact_mobile, campaign.uid, campaign.phonebook_id],
  );

  if (contacts && contacts.length > 0) {
    return contacts[0];
  }

  return {
    name: log.contact_name,
    mobile: log.contact_mobile,
    var1: "",
    var2: "",
    var3: "",
    var4: "",
    var5: "",
  };
}

async function updateCampaignCounts(campaignId) {
  try {
    await query(
      `UPDATE beta_campaign SET
        sent_count = (SELECT COUNT(*) FROM beta_campaign_logs WHERE campaign_id = ? AND status = 'SENT'),
        failed_count = (SELECT COUNT(*) FROM beta_campaign_logs WHERE campaign_id = ? AND status = 'FAILED'),
        delivered_count = (SELECT COUNT(*) FROM beta_campaign_logs WHERE campaign_id = ? AND delivery_status = 'delivered'),
        read_count = (SELECT COUNT(*) FROM beta_campaign_logs WHERE campaign_id = ? AND delivery_status = 'read')
       WHERE campaign_id = ?`,
      [campaignId, campaignId, campaignId, campaignId, campaignId],
    );
  } catch (error) {
    console.error(`Error updating campaign counts for ${campaignId}:`, error);
  }
}

async function checkAndMarkCampaignComplete(campaign) {
  const [pendingCount] = await query(
    `SELECT COUNT(*) as count FROM beta_campaign_logs 
     WHERE campaign_id = ? AND status = 'PENDING'`,
    [campaign.campaign_id],
  );

  const [totalLogsCount] = await query(
    `SELECT COUNT(*) as count FROM beta_campaign_logs 
     WHERE campaign_id = ?`,
    [campaign.campaign_id],
  );

  if (pendingCount.count === 0 && totalLogsCount.count > 0) {
    await query(
      "UPDATE beta_campaign SET status = 'COMPLETED' WHERE campaign_id = ?",
      [campaign.campaign_id],
    );
  } else if (totalLogsCount.count === 0) {
    await query(
      "UPDATE beta_campaign SET status = 'COMPLETED' WHERE campaign_id = ?",
      [campaign.campaign_id],
    );
  }
}

function replaceContactVariables(variables, contact) {
  if (!Array.isArray(variables)) return variables;
  return variables.map((variable) => replaceContactVariable(variable, contact));
}

function replaceContactVariable(variable, contact) {
  if (typeof variable !== "string") return variable;

  let result = variable.replace(/\{\{\{name\}\}\}/g, contact.name || "");
  result = result.replace(/\{\{\{mobile\}\}\}/g, contact.mobile || "");

  for (let i = 1; i <= 5; i++) {
    const pattern = new RegExp(`\\{\\{\\{var${i}\\}\\}\\}`, "g");
    result = result.replace(pattern, contact[`var${i}`] || "");
  }

  return result;
}

async function updateMessageStatus(metaMsgId, status, errorMessage = null) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const logs = await query(
      "SELECT * FROM beta_campaign_logs WHERE meta_msg_id = ? LIMIT 1",
      [metaMsgId],
    );

    if (!logs || logs.length === 0) {
      return;
    }

    const log = logs[0];

    if (log.delivery_status === "read" && status === "delivered") {
      return;
    }

    await query(
      `UPDATE beta_campaign_logs 
       SET delivery_status = ?, delivery_time = NOW(), error_message = ?
       WHERE meta_msg_id = ?`,
      [status, errorMessage, metaMsgId],
    );

    await updateCampaignCounts(log.campaign_id);
  } catch (error) {
    console.error(`Error updating message status for ${metaMsgId}:`, error);
  }
}

module.exports = {
  initCampaign,
  updateMessageStatus,
  sendCarouselTemplateMessage,
  sendCatalogTemplateMessage,
};
