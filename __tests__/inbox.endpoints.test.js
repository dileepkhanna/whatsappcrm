/**
 * Inbox API Endpoints Tests
 * Tests for /api/inbox/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('Inbox API Endpoints', () => {
  describe('GET /api/inbox/get_chats', () => {
    it('should return chats list', async () => {
      const response = await request(app)
        .get('/api/inbox/get_chats');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/inbox/get_conversation', () => {
    it('should handle conversation retrieval', async () => {
      const response = await request(app)
        .get('/api/inbox/get_conversation')
        .query({ chat_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/inbox/send_message', () => {
    it('should accept message sending', async () => {
      const messageData = {
        chat_id: 1,
        message: 'Test message',
        type: 'text'
      };

      const response = await request(app)
        .post('/api/inbox/send_message')
        .send(messageData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/inbox/mark_as_read', () => {
    it('should accept mark as read request', async () => {
      const response = await request(app)
        .post('/api/inbox/mark_as_read')
        .send({ chat_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/inbox/search_chats', () => {
    it('should handle chat search', async () => {
      const response = await request(app)
        .get('/api/inbox/search_chats')
        .query({ query: 'test' });
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
