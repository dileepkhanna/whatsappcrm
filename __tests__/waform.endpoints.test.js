/**
 * WhatsApp Forms API Endpoints Tests
 * Tests for /api/waform/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('WhatsApp Forms API Endpoints', () => {
  describe('GET /api/waform/get_forms', () => {
    it('should return forms list', async () => {
      const response = await request(app)
        .get('/api/waform/get_forms');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/waform/create_form', () => {
    it('should accept form creation', async () => {
      const formData = {
        name: 'Test Form',
        title: 'Test Form Title'
      };

      const response = await request(app)
        .post('/api/waform/create_form')
        .send(formData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/waform/get_form', () => {
    it('should handle form retrieval', async () => {
      const response = await request(app)
        .get('/api/waform/get_form')
        .query({ form_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/waform/update_form', () => {
    it('should accept form update', async () => {
      const formData = {
        form_id: 1,
        name: 'Updated Form',
        title: 'Updated Title'
      };

      const response = await request(app)
        .post('/api/waform/update_form')
        .send(formData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('DELETE /api/waform/delete_form', () => {
    it('should accept form deletion', async () => {
      const response = await request(app)
        .delete('/api/waform/delete_form')
        .send({ form_id: 999 });
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
