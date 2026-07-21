/**
 * Admin API Endpoints Tests
 * Tests for /api/admin/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('Admin API Endpoints', () => {
  describe('GET /api/admin/get_smtp', () => {
    it('should return SMTP configuration', async () => {
      const response = await request(app)
        .get('/api/admin/get_smtp')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500); // Should not error
      expect(response.body).toBeDefined();
    });
  });

  describe('POST /api/admin/update_smtp', () => {
    it('should accept SMTP update request', async () => {
      const smtpData = {
        email: 'test@example.com',
        host: 'smtp.example.com',
        port: '587',
        password: 'testpass',
        username: 'test@example.com'
      };

      const response = await request(app)
        .post('/api/admin/update_smtp')
        .send(smtpData)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/admin/get_users', () => {
    it('should return users list', async () => {
      const response = await request(app)
        .get('/api/admin/get_users')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/admin/get_qr_set', () => {
    it('should return QR plugin settings', async () => {
      const response = await request(app)
        .get('/api/admin/get_qr_set')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/admin/update_qr_set', () => {
    it('should accept QR settings update', async () => {
      const qrSettings = {
        storage_type: 'local'
      };

      const response = await request(app)
        .post('/api/admin/update_qr_set')
        .send(qrSettings);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/admin/get_plans', () => {
    it('should return subscription plans', async () => {
      const response = await request(app)
        .get('/api/admin/get_plans')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/admin/dashboard_stats', () => {
    it('should return dashboard statistics', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard_stats');
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
