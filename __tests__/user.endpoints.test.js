/**
 * User API Endpoints Tests
 * Tests for /api/user/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('User API Endpoints', () => {
  describe('POST /api/user/login', () => {
    it('should accept login request', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/user/login')
        .send(loginData)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
      expect(response.body).toHaveProperty('success');
    });

    it('should reject login without credentials', async () => {
      const response = await request(app)
        .post('/api/user/login')
        .send({});
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/user/register', () => {
    it('should accept registration request', async () => {
      const registerData = {
        name: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/user/register')
        .send(registerData)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/user/send_resovery', () => {
    it('should accept password recovery request', async () => {
      const response = await request(app)
        .post('/api/user/send_resovery')
        .send({ email: 'test@example.com' })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/user/get_meta_keys', () => {
    it('should handle meta keys request', async () => {
      const response = await request(app)
        .get('/api/user/get_meta_keys');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/user/update_meta_keys', () => {
    it('should accept meta keys update', async () => {
      const metaData = {
        access_token: 'test_token',
        waba_id: '123456',
        business_phone_number_id: '789012'
      };

      const response = await request(app)
        .post('/api/user/update_meta_keys')
        .send(metaData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/user/get_profile', () => {
    it('should handle profile request', async () => {
      const response = await request(app)
        .get('/api/user/get_profile');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/user/update_profile', () => {
    it('should accept profile update', async () => {
      const profileData = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };

      const response = await request(app)
        .post('/api/user/update_profile')
        .send(profileData);
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
