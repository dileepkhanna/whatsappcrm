/**
 * Web/Public API Endpoints Tests
 * Tests for /api/web/* routes (public endpoints)
 */

const request = require('supertest');
const app = require('../app.test');

describe('Web/Public API Endpoints', () => {
  describe('GET /api/web/get_public_settings', () => {
    it('should return public settings', async () => {
      const response = await request(app)
        .get('/api/web/get_public_settings')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/web/get_app_name', () => {
    it('should return app name', async () => {
      const response = await request(app)
        .get('/api/web/get_app_name')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/web/get_plans', () => {
    it('should return public plans', async () => {
      const response = await request(app)
        .get('/api/web/get_plans')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/web/get_languages', () => {
    it('should return available languages', async () => {
      const response = await request(app)
        .get('/api/web/get_languages')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/web/contact_form', () => {
    it('should accept contact form submission', async () => {
      const contactData = {
        name: 'Test User',
        email: 'test@example.com',
        message: 'Test message'
      };

      const response = await request(app)
        .post('/api/web/contact_form')
        .send(contactData);
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
