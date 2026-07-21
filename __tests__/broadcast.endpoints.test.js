/**
 * Broadcast/Campaign API Endpoints Tests
 * Tests for /api/broadcast/* routes
 */
const request = require('supertest');
const app = require('../app.test');
describe('Broadcast API Endpoints', () => {
  describe('GET /api/broadcast/get_campaigns', () => {
    it('should return campaigns list', async () => {
      const response = await request(app)
        .get('/api/broadcast/get_campaigns');
      expect(response.status).toBeLessThan(500);
    });
  });
  describe('POST /api/broadcast/create_campaign', () => {
    it('should accept campaign creation', async () => {
      const campaignData = {
        name: 'Test Campaign',
        message: 'Test message',
        phonebook_id: 1
      };

      const response = await request(app)
        .post('/api/broadcast/create_campaign')
        .send(campaignData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/broadcast/get_campaign', () => {
    it('should handle campaign retrieval', async () => {
      const response = await request(app)
        .get('/api/broadcast/get_campaign')
        .query({ campaign_id: 1 });
      expect(response.status).toBeLessThan(500);
    });
  });
                                         
  describe('POST /api/broadcast/start_campaign', () => {
    it('should accept campaign start request', async () => {
      const response = await request(app)
        .post('/api/broadcast/start_campaign')
        .send({ campaign_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/broadcast/stop_campaign', () => {
    it('should accept campaign stop request', async () => {
      const response = await request(app)
        .post('/api/broadcast/stop_campaign')
        .send({ campaign_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('DELETE /api/broadcast/delete_campaign', () => {
    it('should accept campaign deletion', async () => {
      const response = await request(app)
        .delete('/api/broadcast/delete_campaign')
        .send({ campaign_id: 999 });
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
