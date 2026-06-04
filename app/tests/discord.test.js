/**
 * Tests webhook Discord par projet
 * - Service : validation d'URL, envoi, gestion d'échec
 * - Routes admin : persistance du champ discord_webhook, route de test
 * - Route publique : déclenchement sur soumission finale uniquement
 */

const request = require('supertest');
const express = require('express');

process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.ADMIN_URL_PATH = 'test-admin';
process.env.NODE_ENV = 'test';

const adminRoutes = require('../routes/admin');
const publicRoutes = require('../routes/public');
const { isValidWebhookUrl, notifySubmission, sendTest } = require('../services/discord');

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123456789/aBc-DeF_123';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);
  return app;
}

async function getAuthToken(app) {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ password: 'test-password-123' });
  return res.body.token;
}

async function createProjectWithForm(app, token, webhook) {
  const structure = {
    title: 'Form Webhook',
    sections: [{
      id: 's1',
      title: 'Section',
      fields: [{ id: 'f1', label: 'Champ', type: 'text', required: false }]
    }]
  };
  const gabarit = (await request(app)
    .post('/api/admin/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Form Webhook', structure })).body;

  const project = (await request(app)
    .post('/api/admin/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Projet Webhook', discord_webhook: webhook, template_ids: [gabarit.id] })).body;

  const instances = (await request(app)
    .get(`/api/admin/forms?project_id=${project.id}`)
    .set('Authorization', `Bearer ${token}`)).body;

  return { project, instance: instances[0] };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================================================
// SERVICE DISCORD
// =============================================================================

describe('Service Discord - validation URL', () => {
  test('accepte une URL de webhook Discord valide', () => {
    expect(isValidWebhookUrl(WEBHOOK_URL)).toBe(true);
    // Certains tokens Discord contiennent des points
    expect(isValidWebhookUrl('https://discord.com/api/webhooks/123/aBc.DeF_1-23')).toBe(true);
  });

  test('rejette les URLs non-Discord et malformées', () => {
    expect(isValidWebhookUrl('https://evil.com/api/webhooks/123/abc')).toBe(false);
    expect(isValidWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false);
    expect(isValidWebhookUrl('https://discord.com/api/webhooks/123/abc/extra')).toBe(false);
    expect(isValidWebhookUrl('https://discord.com.evil.com/api/webhooks/123/abc')).toBe(false);
    expect(isValidWebhookUrl('https://discord.com/api/webhooks/abc/def?x=1')).toBe(false);
    expect(isValidWebhookUrl('')).toBe(false);
    expect(isValidWebhookUrl(null)).toBe(false);
    expect(isValidWebhookUrl(undefined)).toBe(false);
  });
});

describe('Service Discord - envoi', () => {
  test('notifySubmission envoie un embed sans données client', async () => {
    await notifySubmission({
      webhookUrl: WEBHOOK_URL,
      projectName: 'Projet X',
      formTitle: 'Formulaire Y',
      isUpdate: false
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    const body = JSON.parse(options.body);
    expect(body.embeds[0].title).toBe('Nouvelle soumission');
    expect(options.body).toContain('Projet X');
    expect(options.body).toContain('Formulaire Y');
  });

  test('notifySubmission distingue une mise à jour', async () => {
    await notifySubmission({
      webhookUrl: WEBHOOK_URL,
      projectName: 'P',
      formTitle: 'F',
      isUpdate: true
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toBe('Soumission mise à jour');
  });

  test('notifySubmission ne propage jamais une erreur réseau', async () => {
    global.fetch.mockRejectedValue(new Error('réseau KO'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(notifySubmission({
      webhookUrl: WEBHOOK_URL,
      projectName: 'P',
      formTitle: 'F',
      isUpdate: false
    })).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
  });

  test('sendTest propage une réponse non-ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(sendTest(WEBHOOK_URL)).rejects.toThrow('404');
  });

  test('les champs d\'embed sont tronqués à la limite Discord (1024)', async () => {
    await notifySubmission({
      webhookUrl: WEBHOOK_URL,
      projectName: 'x'.repeat(3000),
      formTitle: 'F',
      isUpdate: false
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.embeds[0].fields[0].value.length).toBeLessThanOrEqual(1024);
    expect(body.embeds[0].fields[0].value.endsWith('…')).toBe(true);
  });
});

// =============================================================================
// ROUTES ADMIN
// =============================================================================

describe('Admin - discord_webhook sur les projets', () => {
  let app, token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('création avec webhook valide : persisté', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P1', discord_webhook: WEBHOOK_URL });

    expect(res.status).toBe(200);
    expect(res.body.discord_webhook).toBe(WEBHOOK_URL);
  });

  test('création avec webhook invalide : 400', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P2', discord_webhook: 'https://evil.com/hook' });

    expect(res.status).toBe(400);
  });

  test('création sans webhook : null', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P3' });

    expect(res.status).toBe(200);
    expect(res.body.discord_webhook).toBeNull();
  });

  test('PUT : absent = inchangé, vide = effacé, invalide = 400', async () => {
    const project = (await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P4', discord_webhook: WEBHOOK_URL })).body;

    // Absent : inchangé
    let res = await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P4 bis' });
    expect(res.body.discord_webhook).toBe(WEBHOOK_URL);

    // Invalide : 400
    res = await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discord_webhook: 'nimporte-quoi' });
    expect(res.status).toBe(400);

    // Vide : effacé
    res = await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discord_webhook: '' });
    expect(res.status).toBe(200);
    expect(res.body.discord_webhook).toBeNull();
  });
});

describe('Admin - POST /projects/webhook-test', () => {
  let app, token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('sans auth : 401', async () => {
    const res = await request(app)
      .post('/api/admin/projects/webhook-test')
      .send({ url: WEBHOOK_URL });
    expect(res.status).toBe(401);
  });

  test('URL invalide : 400, aucun appel sortant', async () => {
    const res = await request(app)
      .post('/api/admin/projects/webhook-test')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://evil.com/hook' });
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('envoi réussi : success', async () => {
    const res = await request(app)
      .post('/api/admin/projects/webhook-test')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: WEBHOOK_URL });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('Discord en erreur : 502', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });
    const res = await request(app)
      .post('/api/admin/projects/webhook-test')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: WEBHOOK_URL });
    expect(res.status).toBe(502);
  });
});

// =============================================================================
// ROUTE PUBLIQUE - déclenchement à la soumission
// =============================================================================

describe('Public - notification à la soumission', () => {
  let app, token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('soumission finale : notification envoyée, sans données client', async () => {
    const { instance } = await createProjectWithForm(app, token, WEBHOOK_URL);
    global.fetch.mockClear();

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'donnée ultra confidentielle' }, action: 'submit' });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(options.body).toContain('Nouvelle soumission');
    expect(options.body).not.toContain('ultra confidentielle');
  });

  test('brouillon : aucune notification', async () => {
    const { instance } = await createProjectWithForm(app, token, WEBHOOK_URL);
    global.fetch.mockClear();

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'save' });

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('projet sans webhook : aucune notification', async () => {
    const { instance } = await createProjectWithForm(app, token, undefined);
    global.fetch.mockClear();

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'submit' });

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('re-soumission : embed « mise à jour »', async () => {
    const { instance } = await createProjectWithForm(app, token, WEBHOOK_URL);

    const first = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'v1' }, action: 'submit' });
    global.fetch.mockClear();

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'v2' }, action: 'submit', submission_id: first.body.id });

    expect(res.status).toBe(200);
    expect(res.body.was_already_submitted).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].body).toContain('Soumission mise à jour');
  });

  test('Discord en panne : la soumission aboutit quand même', async () => {
    const { instance } = await createProjectWithForm(app, token, WEBHOOK_URL);
    global.fetch.mockClear();
    global.fetch.mockRejectedValue(new Error('Discord down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { f1: 'x' }, action: 'submit' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');

    // Laisse la promesse fire-and-forget se résoudre avant de vérifier le log
    await new Promise((resolve) => setImmediate(resolve));
    expect(consoleSpy).toHaveBeenCalled();
  });
});
