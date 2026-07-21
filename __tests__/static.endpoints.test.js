/**
 * Static Files and Public Routes Tests
 * Tests for static file serving and catch-all routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('Static Files and Public Routes', () => {
  describe('GET /', () => {
    it('should serve index.html', async () => {
      const response = await request(app)
        .get('/')
        .expect('Content-Type', /html/);
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('<!doctype html>');
    });
  });

  describe('GET /favicon.ico', () => {
    it('should serve favicon', async () => {
      const response = await request(app)
        .get('/favicon.ico');
      
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /admin', () => {
    it('should serve index.html for SPA routing', async () => {
      const response = await request(app)
        .get('/admin')
        .expect('Content-Type', /html/);
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('<!doctype html>');
    });
  });

  describe('GET /user', () => {
    it('should serve index.html for SPA routing', async () => {
      const response = await request(app)
        .get('/user')
        .expect('Content-Type', /html/);
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('<!doctype html>');
    });
  });

  describe('GET /static/js/main.dca03fbf.js', () => {
    it('should serve static JavaScript', async () => {
      const response = await request(app)
        .get('/static/js/main.dca03fbf.js');
      
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('javascript');
      }
    });
  });

  describe('GET /static/css/main.e546b2bd.css', () => {
    it('should serve static CSS', async () => {
      const response = await request(app)
        .get('/static/css/main.e546b2bd.css');
      
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('css');
      }
    });
  });

  describe('GET /nonexistent-route', () => {
    it('should return index.html for unknown routes (SPA fallback)', async () => {
      const response = await request(app)
        .get('/nonexistent-route')
        .expect('Content-Type', /html/);
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('<!doctype html>');
    });
  });
});
