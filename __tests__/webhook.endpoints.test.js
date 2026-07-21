/**
 * Webhook API Endpoints Tests
 * Tests for /api/webhook/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('Webhook API Endpoints', () => {
  describe('GET /api/webhook/meta', () => {
    it('should handle Meta webhook verification', async () => {
      const response = await request(app)
        .get('/api/webhook/meta')
        .query({
          'hub.mode': 'subscribe',
          'hub.challenge': 'test_challenge',
          'hub.verify_token': 'test_token'
        });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/webhook/meta', () => {
    it('should accept Meta webhook payload', async () => {
      const webhookData = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: '123456'
              },
              messages: []
            }
          }]
        }]
      };

      const response = await request(app)
        .post('/api/webhook/meta')
        .send(webhookData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/webhook/telegram', () => {
    it('should accept Telegram webhook', async () => {
      const telegramData = {
        update_id: 123,
        message: {
          message_id: 1,
          text: 'test',
          chat: { id: 123 }
        }
      };

      const response = await request(app)
        .post('/api/webhook/telegram')
        .send(telegramData);
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
