const express = require('express');
const request = require('supertest');
const { validators, handleValidationErrors } = require('../../../src/shared/utils/validators');

const buildApp = (rules) => {
  const app = express();
  app.use(express.json());
  app.post('/test', rules, handleValidationErrors, (req, res) => res.json({ success: true }));
  return app;
};

describe('validators', () => {
  describe('email', () => {
    const app = buildApp([validators.email()]);

    it('accepts a valid email', async () => {
      const res = await request(app).post('/test').send({ email: 'user@example.com' });
      expect(res.status).toBe(200);
    });

    it('rejects a missing/invalid email', async () => {
      const res = await request(app).post('/test').send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('email');
    });
  });

  describe('password', () => {
    const app = buildApp([validators.password()]);

    it('rejects a password shorter than 6 characters', async () => {
      const res = await request(app).post('/test').send({ password: '123' });
      expect(res.status).toBe(400);
    });

    it('accepts a 6+ character password', async () => {
      const res = await request(app).post('/test').send({ password: 'abcdef' });
      expect(res.status).toBe(200);
    });
  });

  describe('phone', () => {
    const app = buildApp([validators.phone()]);

    it('accepts a 10-digit phone number', async () => {
      const res = await request(app).post('/test').send({ phone: '9876543210' });
      expect(res.status).toBe(200);
    });

    it.each(['12345', 'abcdefghij', '98765432101'])('rejects malformed phone "%s"', async (phone) => {
      const res = await request(app).post('/test').send({ phone });
      expect(res.status).toBe(400);
    });
  });

  describe('mongoId', () => {
    const app = express();
    app.get('/items/:id', [validators.mongoId('id')], handleValidationErrors, (req, res) => res.json({ success: true }));

    it('accepts a valid ObjectId', async () => {
      const res = await request(app).get('/items/507f1f77bcf86cd799439011');
      expect(res.status).toBe(200);
    });

    it('rejects an invalid ObjectId', async () => {
      const res = await request(app).get('/items/not-an-id');
      expect(res.status).toBe(400);
    });
  });

  describe('category', () => {
    const app = buildApp([validators.category()]);

    it.each(['free', 'paid', 'exclusive'])('accepts category "%s"', async (category) => {
      const res = await request(app).post('/test').send({ category });
      expect(res.status).toBe(200);
    });

    it('rejects an unknown category', async () => {
      const res = await request(app).post('/test').send({ category: 'bogus' });
      expect(res.status).toBe(400);
    });
  });

  describe('price', () => {
    const app = buildApp([validators.price()]);

    it('accepts zero and positive numbers', async () => {
      expect((await request(app).post('/test').send({ price: 0 })).status).toBe(200);
      expect((await request(app).post('/test').send({ price: 199.99 })).status).toBe(200);
    });

    it('rejects a negative price', async () => {
      const res = await request(app).post('/test').send({ price: -10 });
      expect(res.status).toBe(400);
    });
  });

  describe('ifscCode', () => {
    const app = buildApp([validators.ifscCode()]);

    it('accepts a valid IFSC code', async () => {
      const res = await request(app).post('/test').send({ ifscCode: 'HDFC0001234' });
      expect(res.status).toBe(200);
    });

    it('rejects a malformed IFSC code', async () => {
      const res = await request(app).post('/test').send({ ifscCode: '1234ABCDE' });
      expect(res.status).toBe(400);
    });
  });

  describe('githubUrl (optional field)', () => {
    const app = buildApp([validators.githubUrl()]);

    it('accepts an empty/absent githubUrl since it is optional', async () => {
      const res = await request(app).post('/test').send({});
      expect(res.status).toBe(200);
    });

    it('accepts a valid GitHub URL', async () => {
      const res = await request(app).post('/test').send({ githubUrl: 'https://github.com/owner/repo' });
      expect(res.status).toBe(200);
    });

    it('rejects a non-GitHub URL', async () => {
      const res = await request(app).post('/test').send({ githubUrl: 'https://example.com/owner/repo' });
      expect(res.status).toBe(400);
    });
  });

  describe('pagination', () => {
    const app = express();
    app.get('/list', validators.pagination(), handleValidationErrors, (req, res) => res.json({ success: true }));

    it('accepts valid page/limit query params', async () => {
      const res = await request(app).get('/list?page=2&limit=20');
      expect(res.status).toBe(200);
    });

    it('rejects a limit above the max of 100', async () => {
      const res = await request(app).get('/list?limit=500');
      expect(res.status).toBe(400);
    });

    it('rejects a non-positive page number', async () => {
      const res = await request(app).get('/list?page=0');
      expect(res.status).toBe(400);
    });
  });

  describe('handleValidationErrors error shape', () => {
    it('returns field-level messages for every failing rule', async () => {
      const app = buildApp([validators.email(), validators.password()]);
      const res = await request(app).post('/test').send({ email: 'bad', password: '1' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      const fields = res.body.errors.map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
    });
  });
});
