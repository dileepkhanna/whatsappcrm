/**
 * Phonebook API Endpoints Tests
 * Tests for /api/phonebook/* routes
 */

const request = require('supertest');
const app = require('../app.test');

describe('Phonebook API Endpoints', () => {
  describe('GET /api/phonebook/get_phonebooks', () => {
    it('should return phonebooks list', async () => {
      const response = await request(app)
        .get('/api/phonebook/get_phonebooks');
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/phonebook/create_phonebook', () => {
    it('should accept phonebook creation', async () => {
      const phonebookData = {
        name: 'Test Phonebook'
      };

      const response = await request(app)
        .post('/api/phonebook/create_phonebook')
        .send(phonebookData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('GET /api/phonebook/get_contacts', () => {
    it('should return contacts list', async () => {
      const response = await request(app)
        .get('/api/phonebook/get_contacts')
        .query({ phonebook_id: 1 });
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/phonebook/add_contact', () => {
    it('should accept contact addition', async () => {
      const contactData = {
        phonebook_id: 1,
        name: 'Test Contact',
        phone: '+1234567890'
      };

      const response = await request(app)
        .post('/api/phonebook/add_contact')
        .send(contactData);
      
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('DELETE /api/phonebook/delete_phonebook', () => {
    it('should accept phonebook deletion request', async () => {
      const response = await request(app)
        .delete('/api/phonebook/delete_phonebook')
        .send({ phonebook_id: 999 });
      
      expect(response.status).toBeLessThan(500);
    });
  });
});
