-- ============================================================
-- WhatsCRM v5.9.5 - MySQL Schema
-- Auto-reconstructed from source code analysis
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- admin
-- ----------------------------
CREATE TABLE IF NOT EXISTS `admin` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'admin',
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- user
-- ----------------------------
CREATE TABLE IF NOT EXISTS `user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `mobile_with_country_code` varchar(50) DEFAULT NULL,
  `timezone` varchar(100) DEFAULT 'UTC',
  `role` varchar(50) DEFAULT 'user',
  `plan` text DEFAULT NULL,
  `plan_expire` datetime DEFAULT NULL,
  `trial` tinyint(1) DEFAULT 0,
  `api_key` varchar(255) DEFAULT NULL,
  `fcm_data` text DEFAULT NULL,
  `fcm_inbox` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- plan
-- ----------------------------
CREATE TABLE IF NOT EXISTS `plan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `short_description` text DEFAULT NULL,
  `allow_tag` tinyint(1) DEFAULT 0,
  `allow_note` tinyint(1) DEFAULT 0,
  `allow_chatbot` tinyint(1) DEFAULT 0,
  `contact_limit` int(11) DEFAULT 0,
  `allow_api` tinyint(1) DEFAULT 0,
  `is_trial` tinyint(1) DEFAULT 0,
  `price` decimal(10,2) DEFAULT 0,
  `price_strike` decimal(10,2) DEFAULT NULL,
  `plan_duration_in_days` int(11) DEFAULT 30,
  `qr_account` int(11) DEFAULT 0,
  `wa_warmer` tinyint(1) DEFAULT 0,
  `rest_api_qr` tinyint(1) DEFAULT 0,
  `instagram_inbox` tinyint(1) DEFAULT 0,
  `telegram_inbox` tinyint(1) DEFAULT 0,
  `allow_wa_forms` tinyint(1) DEFAULT 0,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- web_public
-- ----------------------------
CREATE TABLE IF NOT EXISTS `web_public` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `app_name` varchar(255) DEFAULT 'WhatsCRM',
  `logo` varchar(255) DEFAULT NULL,
  `custom_home` text DEFAULT NULL,
  `is_custom_home` tinyint(1) DEFAULT 0,
  `meta_description` text DEFAULT NULL,
  `currency_code` varchar(20) DEFAULT 'USD',
  `currency_symbol` varchar(10) DEFAULT '$',
  `home_page_tutorial` text DEFAULT NULL,
  `chatbot_screen_tutorial` text DEFAULT NULL,
  `broadcast_screen_tutorial` text DEFAULT NULL,
  `login_header_footer` text DEFAULT NULL,
  `exchange_rate` decimal(10,4) DEFAULT 1.0000,
  `google_client_id` varchar(255) DEFAULT NULL,
  `google_login_active` tinyint(1) DEFAULT 0,
  `fb_login_app_id` varchar(255) DEFAULT NULL,
  `fb_login_app_sec` varchar(255) DEFAULT NULL,
  `fb_login_active` tinyint(1) DEFAULT 0,
  `rtl` tinyint(1) DEFAULT 0,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- web_private
-- ----------------------------
CREATE TABLE IF NOT EXISTS `web_private` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pay_offline_id` varchar(255) DEFAULT NULL,
  `pay_offline_key` varchar(255) DEFAULT NULL,
  `offline_active` tinyint(1) DEFAULT 0,
  `pay_stripe_id` varchar(255) DEFAULT NULL,
  `pay_stripe_key` varchar(255) DEFAULT NULL,
  `stripe_active` tinyint(1) DEFAULT 0,
  `pay_paypal_id` varchar(255) DEFAULT NULL,
  `pay_paypal_key` varchar(255) DEFAULT NULL,
  `paypal_active` tinyint(1) DEFAULT 0,
  `rz_id` varchar(255) DEFAULT NULL,
  `rz_key` varchar(255) DEFAULT NULL,
  `rz_active` tinyint(1) DEFAULT 0,
  `pay_paystack_id` varchar(255) DEFAULT NULL,
  `pay_paystack_key` varchar(255) DEFAULT NULL,
  `paystack_active` tinyint(1) DEFAULT 0,
  `pay_mercadopago_public_key` varchar(255) DEFAULT NULL,
  `pay_mercadopago_access_token` varchar(255) DEFAULT NULL,
  `mercadopago_active` tinyint(1) DEFAULT 0,
  `qr_storage` varchar(50) DEFAULT 'local',
  `mongodb_string` text DEFAULT NULL,
  `embed_app_sec` varchar(255) DEFAULT NULL,
  `embed_app_id` varchar(255) DEFAULT NULL,
  `embed_app_config` text DEFAULT NULL,
  `teleAppId` varchar(255) DEFAULT NULL,
  `teleHash` varchar(255) DEFAULT NULL,
  `insta_app_id` varchar(255) DEFAULT NULL,
  `insta_app_secret` varchar(255) DEFAULT NULL,
  `insta_callback_url` varchar(500) DEFAULT NULL,
  `fcm_apiKey` varchar(255) DEFAULT NULL,
  `fcm_authDomain` varchar(255) DEFAULT NULL,
  `fcm_projectId` varchar(255) DEFAULT NULL,
  `fcm_storageBucket` varchar(255) DEFAULT NULL,
  `fcm_messagingSenderId` varchar(255) DEFAULT NULL,
  `fcm_appId` varchar(255) DEFAULT NULL,
  `fcm_measurementId` varchar(255) DEFAULT NULL,
  `fcm_vapidKey` text DEFAULT NULL,
  `fcm_clientEmail` varchar(255) DEFAULT NULL,
  `fcm_privateKey` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- instance (WhatsApp QR sessions)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `instance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `uniqueId` varchar(255) NOT NULL,
  `status` varchar(50) DEFAULT 'disconnected',
  `number` varchar(50) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniqueId` (`uniqueId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- meta_api (WhatsApp Meta/Cloud API config per user)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `meta_api` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `waba_id` varchar(255) DEFAULT NULL,
  `access_token` text DEFAULT NULL,
  `business_phone_number_id` varchar(255) DEFAULT NULL,
  `app_id` varchar(255) DEFAULT NULL,
  `login_type` varchar(50) DEFAULT NULL,
  `embed_data` text DEFAULT NULL,
  `is_coexistence` tinyint(1) DEFAULT 0,
  `platform_type` varchar(50) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- agents
-- ----------------------------
CREATE TABLE IF NOT EXISTS `agents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_uid` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `mobile` varchar(50) DEFAULT NULL,
  `comments` text DEFAULT NULL,
  `fcm_data` text DEFAULT NULL,
  `logs` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- agent_task
-- ----------------------------
CREATE TABLE IF NOT EXISTS `agent_task` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_uid` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- agent_chats
-- ----------------------------
CREATE TABLE IF NOT EXISTS `agent_chats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_uid` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `chat_id` varchar(255) NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- phonebook
-- ----------------------------
CREATE TABLE IF NOT EXISTS `phonebook` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- contact
-- ----------------------------
CREATE TABLE IF NOT EXISTS `contact` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `phonebook_id` int(11) DEFAULT NULL,
  `phonebook_name` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `mobile` varchar(50) NOT NULL,
  `var1` varchar(500) DEFAULT NULL,
  `var2` varchar(500) DEFAULT NULL,
  `var3` varchar(500) DEFAULT NULL,
  `var4` varchar(500) DEFAULT NULL,
  `var5` varchar(500) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- chats (QR-based legacy inbox)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `chats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chat_id` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `last_message_came` datetime DEFAULT NULL,
  `sender_name` varchar(255) DEFAULT NULL,
  `sender_mobile` varchar(50) DEFAULT NULL,
  `last_message` text DEFAULT NULL,
  `is_opened` tinyint(1) DEFAULT 0,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- rooms (QR-based conversations)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `chat_id` varchar(255) DEFAULT NULL,
  `sender_mobile` varchar(50) DEFAULT NULL,
  `sender_name` varchar(255) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `content` text DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_chats (Meta API + multi-channel inbox)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_chats` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `old_chat_id` varchar(255) DEFAULT NULL,
  `profile` text DEFAULT NULL,
  `origin_instance_id` varchar(255) DEFAULT NULL,
  `chat_id` varchar(255) NOT NULL,
  `last_message` text DEFAULT NULL,
  `chat_label` text DEFAULT NULL,
  `kanban_order` int(11) DEFAULT 0,
  `chat_note` text DEFAULT NULL,
  `sender_name` varchar(255) DEFAULT NULL,
  `sender_mobile` varchar(50) DEFAULT NULL,
  `unread_count` int(11) DEFAULT 0,
  `origin` varchar(100) DEFAULT NULL,
  `assigned_agent` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_conversation (messages)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_conversation` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(100) DEFAULT NULL,
  `chat_id` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `status` varchar(50) DEFAULT 'sent',
  `err` text DEFAULT NULL,
  `metaChatId` varchar(255) DEFAULT NULL,
  `msgContext` text DEFAULT NULL,
  `reaction` varchar(50) DEFAULT NULL,
  `timestamp` bigint(20) DEFAULT NULL,
  `senderName` varchar(255) DEFAULT NULL,
  `senderMobile` varchar(50) DEFAULT NULL,
  `star` tinyint(1) DEFAULT 0,
  `route` varchar(50) DEFAULT NULL,
  `context` text DEFAULT NULL,
  `origin` varchar(100) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- chat_tags
-- ----------------------------
CREATE TABLE IF NOT EXISTS `chat_tags` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `hex` varchar(20) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- flow (chatbot flow definitions)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `flow` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `flow_id` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `prevent_list` text DEFAULT NULL,
  `ai_list` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `flow_id` (`flow_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_flows
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_flows` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `flow_id` varchar(255) NOT NULL,
  `source` varchar(100) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `flow_id` (`flow_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_chatbot (chatbot triggers)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_chatbot` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `source` varchar(100) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `origin` varchar(100) DEFAULT NULL,
  `origin_id` varchar(255) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- chatbot (legacy QR chatbot)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `chatbot` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `for_all` tinyint(1) DEFAULT 0,
  `chats` text DEFAULT NULL,
  `flow` text DEFAULT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `origin` varchar(100) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- flow_session
-- ----------------------------
CREATE TABLE IF NOT EXISTS `flow_session` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `origin` varchar(100) DEFAULT NULL,
  `origin_id` varchar(255) DEFAULT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `sender_mobile` varchar(50) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- flow_data
-- ----------------------------
CREATE TABLE IF NOT EXISTS `flow_data` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `uniqueId` varchar(255) DEFAULT NULL,
  `inputs` longtext DEFAULT NULL,
  `other` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- flow_templates
-- ----------------------------
CREATE TABLE IF NOT EXISTS `flow_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `source` varchar(100) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- templets (message templates)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `templets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `content` text DEFAULT NULL,
  `type` varchar(100) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- meta_templet_media
-- ----------------------------
CREATE TABLE IF NOT EXISTS `meta_templet_media` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `templet_name` varchar(255) DEFAULT NULL,
  `meta_hash` varchar(255) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- broadcast
-- ----------------------------
CREATE TABLE IF NOT EXISTS `broadcast` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `broadcast_id` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `templet` text DEFAULT NULL,
  `phonebook` text DEFAULT NULL,
  `status` varchar(50) DEFAULT 'PENDING',
  `schedule` datetime DEFAULT NULL,
  `timezone` varchar(100) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `broadcast_id` (`broadcast_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- broadcast_log
-- ----------------------------
CREATE TABLE IF NOT EXISTS `broadcast_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `broadcast_id` varchar(255) DEFAULT NULL,
  `templet_name` varchar(255) DEFAULT NULL,
  `sender_mobile` varchar(50) DEFAULT NULL,
  `send_to` varchar(50) DEFAULT NULL,
  `delivery_status` varchar(50) DEFAULT NULL,
  `example` text DEFAULT NULL,
  `contact` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_campaign
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_campaign` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `campaign_id` varchar(255) NOT NULL,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `template_name` varchar(255) DEFAULT NULL,
  `template_language` varchar(50) DEFAULT NULL,
  `phonebook_id` int(11) DEFAULT NULL,
  `phonebook_name` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'PENDING',
  `total_contacts` int(11) DEFAULT 0,
  `sent_count` int(11) DEFAULT 0,
  `failed_count` int(11) DEFAULT 0,
  `delivered_count` int(11) DEFAULT 0,
  `read_count` int(11) DEFAULT 0,
  `body_variables` text DEFAULT NULL,
  `header_variable` text DEFAULT NULL,
  `button_variables` text DEFAULT NULL,
  `schedule` datetime DEFAULT NULL,
  `timezone` varchar(100) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `campaign_id` (`campaign_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_campaign_logs
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_campaign_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `campaign_id` varchar(255) DEFAULT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `contact_mobile` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'PENDING',
  `meta_msg_id` varchar(255) DEFAULT NULL,
  `delivery_status` varchar(50) DEFAULT NULL,
  `delivery_time` datetime DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_api_messages
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_api_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `msg_id` varchar(255) DEFAULT NULL,
  `meta_msg_id` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'sent',
  `updated_at` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_api_logs
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_api_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `msg_id` varchar(255) DEFAULT NULL,
  `request` longtext DEFAULT NULL,
  `response` longtext DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- beta_api_analytics
-- ----------------------------
CREATE TABLE IF NOT EXISTS `beta_api_analytics` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `date` date NOT NULL,
  `sent` int(11) DEFAULT 0,
  `delivered` int(11) DEFAULT 0,
  `read` int(11) DEFAULT 0,
  `failed` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid_date` (`uid`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- orders
-- ----------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `payment_mode` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `data` text DEFAULT NULL,
  `s_token` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- instagram_accounts
-- ----------------------------
CREATE TABLE IF NOT EXISTS `instagram_accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `webhook_id` varchar(255) DEFAULT NULL,
  `ig_graph_id` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `page_id` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `profile_pic` text DEFAULT NULL,
  `access_token` text DEFAULT NULL,
  `token_type` varchar(100) DEFAULT NULL,
  `expires_in` bigint(20) DEFAULT NULL,
  `connected_at` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- telegram_session
-- ----------------------------
CREATE TABLE IF NOT EXISTS `telegram_session` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `session_string` text DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'disconnected',
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- quick_reply
-- ----------------------------
CREATE TABLE IF NOT EXISTS `quick_reply` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `msg` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- contact_form
-- ----------------------------
CREATE TABLE IF NOT EXISTS `contact_form` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `mobile` varchar(50) DEFAULT NULL,
  `content` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- faq
-- ----------------------------
CREATE TABLE IF NOT EXISTS `faq` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` text DEFAULT NULL,
  `answer` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- page
-- ----------------------------
CREATE TABLE IF NOT EXISTS `page` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `content` longtext DEFAULT NULL,
  `permanent` tinyint(1) DEFAULT 0,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- partners (brand logos)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `partners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- testimonial
-- ----------------------------
CREATE TABLE IF NOT EXISTS `testimonial` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `reviewer_name` varchar(255) DEFAULT NULL,
  `reviewer_position` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- smtp
-- ----------------------------
CREATE TABLE IF NOT EXISTS `smtp` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) DEFAULT NULL,
  `host` varchar(255) DEFAULT NULL,
  `port` int(11) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- chat_widget
-- ----------------------------
CREATE TABLE IF NOT EXISTS `chat_widget` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `unique_id` varchar(255) DEFAULT NULL,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `whatsapp_number` varchar(50) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `place` varchar(50) DEFAULT NULL,
  `size` varchar(50) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- gen_links
-- ----------------------------
CREATE TABLE IF NOT EXISTS `gen_links` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `wa_mobile` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `msg` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- fcm_tokens
-- ----------------------------
CREATE TABLE IF NOT EXISTS `fcm_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `token` text DEFAULT NULL,
  `other` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- g_auth (Google OAuth)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `g_auth` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `label` varchar(255) DEFAULT NULL,
  `url` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- mobile_app
-- ----------------------------
CREATE TABLE IF NOT EXISTS `mobile_app` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fcmJson` longtext DEFAULT NULL,
  `appTheme` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- warmers
-- ----------------------------
CREATE TABLE IF NOT EXISTS `warmers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `instances` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 0,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- warmer_script
-- ----------------------------
CREATE TABLE IF NOT EXISTS `warmer_script` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- wa_forms
-- ----------------------------
CREATE TABLE IF NOT EXISTS `wa_forms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `flow_status` varchar(50) DEFAULT NULL,
  `fields_json` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- wa_form_submissions
-- ----------------------------
CREATE TABLE IF NOT EXISTS `wa_form_submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `form_name` varchar(255) DEFAULT NULL,
  `from_phone` varchar(50) DEFAULT NULL,
  `raw_payload` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- wa_call_flows
-- ----------------------------
CREATE TABLE IF NOT EXISTS `wa_call_flows` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `flow_id` varchar(255) NOT NULL,
  `source` varchar(100) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `flow_id` (`flow_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- wa_call_bot
-- ----------------------------
CREATE TABLE IF NOT EXISTS `wa_call_bot` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- wa_call_broadcasts
-- ----------------------------
CREATE TABLE IF NOT EXISTS `wa_call_broadcasts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `campaign_id` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `phonebook_id` int(11) DEFAULT NULL,
  `flow_id` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `total_contacts` int(11) DEFAULT 0,
  `logs` longtext DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- wa_call_logs
-- ----------------------------
CREATE TABLE IF NOT EXISTS `wa_call_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uid` varchar(255) NOT NULL,
  `call_id` varchar(255) DEFAULT NULL,
  `from_number` varchar(50) DEFAULT NULL,
  `to_number` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `duration` int(11) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Seed required single-row config tables
-- ============================================================
INSERT IGNORE INTO `web_public` (`id`, `app_name`, `currency_code`, `currency_symbol`) VALUES (1, 'WhatsCRM', 'USD', '$');
INSERT IGNORE INTO `web_private` (`id`) VALUES (1);
INSERT IGNORE INTO `mobile_app` (`id`) VALUES (1);
