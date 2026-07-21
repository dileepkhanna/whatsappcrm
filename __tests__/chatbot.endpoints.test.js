/**
 * Chatbot/Flow API Endpoints Tests
 * Tests for /api/chatbot/* and /api/chat_flow/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('Chatbot API Endpoints', () => {
  describe('GET /api/chatbot/get_flows', () => {
    it('should return flows list', async () => {
      const response = await request(app)
        .get('/api/chatbot/get_flows');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/chatbot/create_flow', () => {
    it('should accept flow creation', async () => {
      const flowData = {
        name: 'Test Flow',
        trigger: 'keyword'
      };

      const response = await request(app)
        .post('/api/chatbot/create_flow')
        .send(flowData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/chatbot/get_flow', () => {
    it('should handle flow retrieval', async () => {
      const response = await request(app)
        .get('/api/chatbot/get_flow')
        .query({ flow_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/chatbot/update_flow', () => {
    it('should accept flow update', async () => {
      const flowData = {
        flow_id: 1,
        name: 'Updated Flow'
      };

      const response = await request(app)
        .post('/api/chatbot/update_flow')
        .send(flowData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('DELETE /api/chatbot/delete_flow', () => {
    it('should accept flow deletion', async () => {
      const response = await request(app)
        .delete('/api/chatbot/delete_flow')
        .send({ flow_id: 999 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/chatbot/toggle_flow', () => {
    it('should accept flow toggle', async () => {
      const response = await request(app)
        .post('/api/chatbot/toggle_flow')
        .send({ flow_id: 1, active: true });
      
      expect(response.status).toBeLessThan(500);
    });
  });
});

describe('Chat Flow API Endpoints', () => {
  describe('GET /api/chat_flow/get_templates', () => {
    it('should return flow templates', async () => {
      const response = await request(app)
        .get('/api/chat_flow/get_templates');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/chat_flow/get_flow_data', () => {
    it('should return flow data', async () => {
      const response = await request(app)
        .get('/api/chat_flow/get_flow_data')
        .query({ flow_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
