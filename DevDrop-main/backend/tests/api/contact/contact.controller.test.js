jest.mock('../../../src/modules/contact/contact.model', () => require('../../mocks/models/contact.model.mock'));
jest.mock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));

const express = require('express');
const request = require('supertest');
const Contact = require('../../../src/modules/contact/contact.model');
const emailService = require('../../../src/services/email.service');
const contactRoutes = require('../../../src/modules/contact/contact.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/contact', contactRoutes);
  return app;
};

let app;

beforeEach(() => {
  Contact.__reset();
  app = buildApp();
});

describe('POST /api/contact', () => {
  const validBody = { name: 'Jane Doe', email: 'jane@example.com', phone: '9876543210', message: 'Hello there' };

  it('creates a contact submission and returns it (happy path)', async () => {
    const res = await request(app).post('/api/contact').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Jane Doe');
    expect(res.body.data.email).toBe('jane@example.com');
    expect(Contact.__all()).toHaveLength(1);
  });

  it('fires an admin alert email on submission without blocking the response', async () => {
    await request(app).post('/api/contact').send(validBody);
    expect(emailService.sendAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'New Contact Us Enquiry' })
    );
  });

  it('accepts a submission with no message (optional field)', async () => {
    const { message, ...withoutMessage } = validBody;
    const res = await request(app).post('/api/contact').send(withoutMessage);
    expect(res.status).toBe(201);
  });

  it('rejects a name shorter than 2 characters', async () => {
    const res = await request(app).post('/api/contact').send({ ...validBody, name: 'J' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects a name longer than 100 characters', async () => {
    const res = await request(app).post('/api/contact').send({ ...validBody, name: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/contact').send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('rejects a phone number that is not 10 digits', async () => {
    const res = await request(app).post('/api/contact').send({ ...validBody, phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('rejects a message longer than 2000 characters', async () => {
    const res = await request(app).post('/api/contact').send({ ...validBody, message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'message')).toBe(true);
  });

  it('reports every failing field together, not just the first', async () => {
    const res = await request(app).post('/api/contact').send({ name: 'J', email: 'bad', phone: '123' });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'phone']));
  });
});

describe('GET /api/contact', () => {
  it('returns an empty, paginated list when there are no submissions', async () => {
    const res = await request(app).get('/api/contact');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual(expect.objectContaining({ page: 1, limit: 20, total: 0, pages: 0 }));
  });

  it('lists existing submissions newest-first', async () => {
    Contact.__seed({ name: 'Older', email: 'older@example.com', phone: '1111111111' });
    Contact.__seed({ name: 'Newer', email: 'newer@example.com', phone: '2222222222' });

    const res = await request(app).get('/api/contact');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('Newer');
  });

  it('respects page and limit query parameters', async () => {
    for (let i = 0; i < 5; i += 1) {
      Contact.__seed({ name: `Person ${i}`, email: `p${i}@example.com`, phone: '3333333333' });
    }
    const res = await request(app).get('/api/contact').query({ page: 2, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual(expect.objectContaining({ page: 2, limit: 2, total: 5, pages: 3 }));
  });

  // NOTE: this endpoint has no `auth`/`adminOnly` middleware in
  // contact.routes.js despite the "for admin dashboard later" comment in
  // production code — see Phase 2B report, "Bugs Discovered". This test
  // documents the *current* (unauthenticated) behavior; it is not an
  // endorsement of it.
  it('is currently reachable without authentication', async () => {
    const res = await request(app).get('/api/contact');
    expect(res.status).not.toBe(401);
  });
});
