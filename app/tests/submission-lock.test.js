/**
 * Tests verrouillage des soumissions validées/archivées
 * Une soumission validated ou archived (statuts posés par l'admin) ne peut
 * plus être modifiée ni rétrogradée par le client via la route publique.
 */

const request = require('supertest');
const express = require('express');

process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.ADMIN_URL_PATH = 'test-admin';
process.env.NODE_ENV = 'test';

const adminRoutes = require('../routes/admin');
const publicRoutes = require('../routes/public');

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123456789/lock-test';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);
  return app;
}

let app, token;

beforeAll(async () => {
  app = createTestApp();
  const res = await request(app)
    .post('/api/admin/login')
    .send({ password: 'test-password-123' });
  token = res.body.token;
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Crée projet + instance + soumission soumise, puis pose le statut admin voulu.
async function createSubmissionWithStatus(status) {
  const structure = {
    title: 'Form Lock',
    sections: [{
      id: 's1',
      title: 'Section',
      fields: [{ id: 'f1', label: 'Champ', type: 'text', required: false }]
    }]
  };
  const gabarit = (await request(app)
    .post('/api/admin/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Form Lock', structure })).body;

  const project = (await request(app)
    .post('/api/admin/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Projet Lock', discord_webhook: WEBHOOK_URL, template_ids: [gabarit.id] })).body;

  const instance = (await request(app)
    .get(`/api/admin/forms?project_id=${project.id}`)
    .set('Authorization', `Bearer ${token}`)).body[0];

  const submission = (await request(app)
    .post(`/api/form/${instance.slug}/submit`)
    .send({ data: { f1: 'données validées' }, action: 'submit' })).body;

  if (status !== 'submitted') {
    await request(app)
      .put(`/api/admin/submissions/${submission.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });
  }

  return { instance, submissionId: submission.id };
}

async function getSubmission(slug, id) {
  return (await request(app)
    .get(`/api/form/${slug}/submission?submission_id=${id}`)).body;
}

describe('Public - verrouillage des soumissions validées', () => {
  test('validated + save : 409, données et statut intacts', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('validated');

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'tentative écrasement' }, action: 'save', submission_id: submissionId });

    expect(res.status).toBe(409);

    const after = await getSubmission(instance.slug, submissionId);
    expect(after.status).toBe('validated');
    expect(after.data.f1).toBe('données validées');
  });

  test('validated + submit : 409', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('validated');

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'submit', submission_id: submissionId });

    expect(res.status).toBe(409);
  });

  test('archived + save : 409', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('archived');

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'save', submission_id: submissionId });

    expect(res.status).toBe(409);
  });

  test('archived + submit : 409', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('archived');

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'submit', submission_id: submissionId });

    expect(res.status).toBe(409);
  });

  test('submitted + save : reprise normale préservée (retour en draft)', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('submitted');

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'reprise' }, action: 'save', submission_id: submissionId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
  });

  test('le 409 ne déclenche aucune notification Discord', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('validated');
    global.fetch.mockClear();

    await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'submit', submission_id: submissionId });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('admin peut rouvrir : status submitted, le client modifie à nouveau', async () => {
    const { instance, submissionId } = await createSubmissionWithStatus('validated');

    await request(app)
      .put(`/api/admin/submissions/${submissionId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'submitted' });

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'corrigé après réouverture' }, action: 'submit', submission_id: submissionId });

    expect(res.status).toBe(200);
    expect(res.body.was_already_submitted).toBe(true);

    const after = await getSubmission(instance.slug, submissionId);
    expect(after.data.f1).toBe('corrigé après réouverture');
    expect(after.status).toBe('submitted');
  });
});
