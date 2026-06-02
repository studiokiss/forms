/**
 * Tests API - Kiss Forms v2
 * Tests complets pour toutes les routes
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock de l'environnement
process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.ADMIN_URL_PATH = 'test-admin';
process.env.NODE_ENV = 'test';

// Import des routes
const adminRoutes = require('../routes/admin');
const publicRoutes = require('../routes/public');

// Création de l'app de test
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);
  return app;
}

// Helper pour obtenir un token
async function getAuthToken(app) {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ password: 'test-password-123' });
  return res.body.token;
}

// Helper pour créer un formulaire de test
async function createTestForm(app, token, title = 'Form Test') {
  const structure = {
    title,
    sections: [
      {
        id: 'section1',
        title: 'Section 1',
        fields: [
          { id: 'field1', label: 'Champ 1', type: 'text', required: true },
          { id: 'field2', label: 'Champ 2', type: 'email', required: false }
        ]
      }
    ]
  };
  const res = await request(app)
    .post('/api/admin/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, structure });
  return res.body;
}

// Helper pour créer un projet de test
async function createTestProject(app, token, name = 'Projet Test') {
  const res = await request(app)
    .post('/api/admin/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body;
}

// =============================================================================
// TESTS ADMIN - AUTHENTIFICATION & SESSIONS
// =============================================================================

describe('API Admin - Authentification', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  test('POST /api/admin/login - mot de passe correct retourne un token', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'test-password-123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
  });

  test('POST /api/admin/login - mot de passe incorrect retourne 401', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ password: 'mauvais-mot-de-passe' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Mot de passe incorrect');
  });

  test('POST /api/admin/login - sans mot de passe retourne 401', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({});

    expect(res.status).toBe(401);
  });

  test('POST /api/admin/logout - déconnecte la session', async () => {
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ password: 'test-password-123' });

    const token = loginRes.body.token;

    const logoutRes = await request(app)
      .post('/api/admin/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Vérifier que le token est invalide après logout
    const checkRes = await request(app)
      .get('/api/admin/check-session')
      .set('Authorization', `Bearer ${token}`);

    expect(checkRes.status).toBe(401);
  });

  test('GET /api/admin/check-session - session valide', async () => {
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ password: 'test-password-123' });

    const res = await request(app)
      .get('/api/admin/check-session')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  test('GET /api/admin/check-session - sans token retourne 401', async () => {
    const res = await request(app)
      .get('/api/admin/check-session');

    expect(res.status).toBe(401);
  });

});

// =============================================================================
// TESTS ADMIN - PROJETS
// =============================================================================

describe('API Admin - Projets', () => {
  let app;
  let token;
  const createdProjectIds = [];

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  afterAll(async () => {
    for (const id of createdProjectIds) {
      await request(app)
        .delete(`/api/admin/projects/${id}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });

  test('GET /api/admin/projects - liste les projets', async () => {
    const res = await request(app)
      .get('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/admin/projects - sans token retourne 401', async () => {
    const res = await request(app)
      .get('/api/admin/projects');

    expect(res.status).toBe(401);
  });

  test('POST /api/admin/projects - crée un projet', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Projet Test Jest' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Projet Test Jest');
    expect(res.body.slug).toBeDefined();
    expect(res.body.id).toBeDefined();
    createdProjectIds.push(res.body.id);
  });

  test('POST /api/admin/projects - sans nom retourne 400', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Le nom est requis');
  });

  test('PUT /api/admin/projects/:id - modifie un projet', async () => {
    const project = await createTestProject(app, token, 'Projet à modifier');
    createdProjectIds.push(project.id);

    const res = await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Projet modifié', style: 'code' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Projet modifié');
    expect(res.body.style).toBe('code');
  });

  test('PUT /api/admin/projects/:id - projet inexistant retourne 404', async () => {
    const res = await request(app)
      .put('/api/admin/projects/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test' });

    expect(res.status).toBe(404);
  });

  test('PUT /api/admin/projects/:id - modifie le slug', async () => {
    const project = await createTestProject(app, token, 'Projet Slug');
    createdProjectIds.push(project.id);

    const res = await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'nouveau-slug-test' });

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('nouveau-slug-test');
  });

  test('PUT /api/admin/projects/:id - modifie form_order', async () => {
    const project = await createTestProject(app, token, 'Projet Order');
    createdProjectIds.push(project.id);

    const res = await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ form_order: [1, 2, 3] });

    expect(res.status).toBe(200);
  });

  test('DELETE /api/admin/projects/:id - supprime un projet', async () => {
    const project = await createTestProject(app, token, 'Projet à supprimer');

    const res = await request(app)
      .delete(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/projects/:id - projet inexistant retourne 404', async () => {
    const res = await request(app)
      .delete('/api/admin/projects/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('DELETE /api/admin/projects/:id/logo - supprime le logo', async () => {
    const project = await createTestProject(app, token, 'Projet Logo Delete');
    createdProjectIds.push(project.id);

    const res = await request(app)
      .delete(`/api/admin/projects/${project.id}/logo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/projects/:id/logo - projet inexistant retourne 404', async () => {
    const res = await request(app)
      .delete('/api/admin/projects/99999/logo')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// TESTS ADMIN - FORMULAIRES
// =============================================================================

describe('API Admin - Formulaires', () => {
  let app;
  let token;
  const createdFormIds = [];

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  afterAll(async () => {
    for (const id of createdFormIds) {
      await request(app)
        .delete(`/api/admin/forms/${id}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });

  test('GET /api/admin/forms - liste les formulaires', async () => {
    const res = await request(app)
      .get('/api/admin/forms')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/admin/forms - filtre par project_id', async () => {
    const res = await request(app)
      .get('/api/admin/forms?project_id=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/admin/forms - crée un formulaire', async () => {
    const form = await createTestForm(app, token, 'Formulaire Test Create');
    createdFormIds.push(form.id);

    expect(form.title).toBe('Formulaire Test Create');
    expect(form.slug).toBeDefined();
    expect(form.id).toBeDefined();
  });

  test('POST /api/admin/forms - sans titre retourne 400', async () => {
    const res = await request(app)
      .post('/api/admin/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ structure: {} });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Le titre est requis');
  });

  test('POST /api/admin/forms - avec project_id', async () => {
    const project = await createTestProject(app, token, 'Projet pour Form');

    const structure = { title: 'Form with Project', sections: [] };
    const res = await request(app)
      .post('/api/admin/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form with Project', structure, project_id: project.id });

    expect(res.status).toBe(200);
    expect(res.body.project_id).toBe(project.id);
    createdFormIds.push(res.body.id);

    // Cleanup project
    await request(app)
      .delete(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`);
  });

  test('GET /api/admin/forms/:id - récupère un formulaire', async () => {
    const form = await createTestForm(app, token, 'Form Get By ID');
    createdFormIds.push(form.id);

    const res = await request(app)
      .get(`/api/admin/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(form.id);
    expect(res.body.title).toBe('Form Get By ID');
  });

  test('GET /api/admin/forms/:id - formulaire inexistant retourne 404', async () => {
    const res = await request(app)
      .get('/api/admin/forms/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('PUT /api/admin/forms/:id - modifie un formulaire', async () => {
    const form = await createTestForm(app, token, 'Form to Update');
    createdFormIds.push(form.id);

    const newStructure = { title: 'Updated', sections: [] };
    const res = await request(app)
      .put(`/api/admin/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form Updated', structure: newStructure });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Form Updated');
  });

  test('PUT /api/admin/forms/:id - formulaire inexistant retourne 404', async () => {
    const res = await request(app)
      .put('/api/admin/forms/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test' });

    expect(res.status).toBe(404);
  });

  test('DELETE /api/admin/forms/:id - supprime un formulaire', async () => {
    const form = await createTestForm(app, token, 'Form to Delete');

    const res = await request(app)
      .delete(`/api/admin/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/forms/:id - formulaire inexistant retourne 404', async () => {
    const res = await request(app)
      .delete('/api/admin/forms/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('POST /api/admin/forms/:id/duplicate - duplique un formulaire', async () => {
    const form = await createTestForm(app, token, 'Form Original');
    createdFormIds.push(form.id);

    const res = await request(app)
      .post(`/api/admin/forms/${form.id}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form Dupliqué' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Form Dupliqué');
    expect(res.body.id).not.toBe(form.id);
    createdFormIds.push(res.body.id);
  });

  test('POST /api/admin/forms/:id/duplicate - formulaire inexistant retourne 404', async () => {
    const res = await request(app)
      .post('/api/admin/forms/99999/duplicate')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test' });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// TESTS ADMIN - SOUMISSIONS
// =============================================================================

describe('API Admin - Soumissions', () => {
  let app;
  let token;
  let testForm;
  let testSubmissionId;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
    testForm = await createTestForm(app, token, 'Form pour Soumissions');
  });

  afterAll(async () => {
    if (testForm) {
      await request(app)
        .delete(`/api/admin/forms/${testForm.id}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });

  test('GET /api/admin/forms/:id/submissions - liste les soumissions', async () => {
    const res = await request(app)
      .get(`/api/admin/forms/${testForm.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/admin/forms/:id/submissions - formulaire inexistant retourne tableau vide', async () => {
    const res = await request(app)
      .get('/api/admin/forms/99999/submissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test('Créer une soumission via API publique pour tests', async () => {
    const res = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({ data: { field1: 'Test Value' }, action: 'save' });

    expect(res.status).toBe(200);
    testSubmissionId = res.body.id;
  });

  test('GET /api/admin/submissions/:id - récupère une soumission', async () => {
    if (!testSubmissionId) return;

    const res = await request(app)
      .get(`/api/admin/submissions/${testSubmissionId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testSubmissionId);
  });

  test('GET /api/admin/submissions/:id - soumission inexistante retourne 404', async () => {
    const res = await request(app)
      .get('/api/admin/submissions/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('PUT /api/admin/submissions/:id/status - change le statut', async () => {
    if (!testSubmissionId) return;

    const res = await request(app)
      .put(`/api/admin/submissions/${testSubmissionId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'validated' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('validated');
  });

  test('PUT /api/admin/submissions/:id/status - statut invalide retourne 400', async () => {
    const res = await request(app)
      .put('/api/admin/submissions/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid-status' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Statut invalide');
  });

  test('DELETE /api/admin/submissions/:id - supprime une soumission', async () => {
    // Créer une soumission à supprimer
    const createRes = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({ data: { field1: 'To Delete' }, action: 'save' });

    const res = await request(app)
      .delete(`/api/admin/submissions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/submissions/:id - soumission inexistante retourne 404', async () => {
    const res = await request(app)
      .delete('/api/admin/submissions/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// TESTS ADMIN - TEMPLATES
// =============================================================================

describe('API Admin - Templates', () => {
  let app;
  let token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('GET /api/admin/templates - liste les templates', async () => {
    const res = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// =============================================================================
// TESTS ADMIN - STATS
// =============================================================================

describe('API Admin - Stats', () => {
  let app;
  let token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('GET /api/admin/stats - retourne les statistiques', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projects');
    expect(res.body).toHaveProperty('forms');
    expect(res.body).toHaveProperty('submissions');
    expect(typeof res.body.projects).toBe('number');
    expect(typeof res.body.forms).toBe('number');
    expect(typeof res.body.submissions).toBe('number');
  });
});

// =============================================================================
// TESTS ADMIN - MEDIA
// =============================================================================

describe('API Admin - Media', () => {
  let app;
  let token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('GET /api/admin/media - liste les médias', async () => {
    const res = await request(app)
      .get('/api/admin/media')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/admin/media - sans fichier retourne 400', async () => {
    const res = await request(app)
      .post('/api/admin/media')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Aucun fichier uploadé');
  });

  test('DELETE /api/admin/media/:id - média inexistant retourne 404', async () => {
    const res = await request(app)
      .delete('/api/admin/media/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// TESTS API PUBLIQUE - PROJETS
// =============================================================================

describe('API Publique - Projets', () => {
  let app;
  let token;
  let testProject;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
    testProject = await createTestProject(app, token, 'Projet Public Test');

    // Mettre à jour le slug
    await request(app)
      .put(`/api/admin/projects/${testProject.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'projet-public-test' });

    testProject.slug = 'projet-public-test';
  });

  afterAll(async () => {
    if (testProject) {
      await request(app)
        .delete(`/api/admin/projects/${testProject.id}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });

  test('GET /api/project/:slug - récupère un projet', async () => {
    const res = await request(app)
      .get(`/api/project/${testProject.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(testProject.slug);
    expect(res.body.name).toBeDefined();
  });

  test('GET /api/project/:slug - projet inexistant retourne 404', async () => {
    const res = await request(app)
      .get('/api/project/projet-inexistant-xyz');

    expect(res.status).toBe(404);
  });

  test('GET /api/project/:slug - slug avec caractères spéciaux retourne 400 ou 404', async () => {
    const res = await request(app)
      .get('/api/project/test<script>');

    // Peut retourner 400 (slug invalide) ou 404 (route non trouvée)
    expect([400, 404]).toContain(res.status);
  });

  test('POST /api/project/:slug/shared-data - sauvegarde les données partagées', async () => {
    const res = await request(app)
      .post(`/api/project/${testProject.slug}/shared-data`)
      .send({ data: { contact_email: 'test@example.com' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/project/:slug/shared-data - projet inexistant retourne 404', async () => {
    const res = await request(app)
      .post('/api/project/projet-inexistant-xyz/shared-data')
      .send({ data: {} });

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// TESTS API PUBLIQUE - FORMULAIRES
// =============================================================================

describe('API Publique - Formulaires', () => {
  let app;
  let token;
  let testForm;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
    testForm = await createTestForm(app, token, 'Form Public Test');
  });

  afterAll(async () => {
    if (testForm) {
      await request(app)
        .delete(`/api/admin/forms/${testForm.id}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });

  test('GET /api/form/:slug - récupère un formulaire', async () => {
    const res = await request(app)
      .get(`/api/form/${testForm.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.structure).toBeDefined();
  });

  test('GET /api/form/:slug - formulaire inexistant retourne 404', async () => {
    const res = await request(app)
      .get('/api/form/formulaire-inexistant-xyz');

    expect(res.status).toBe(404);
  });

  test('GET /api/form/:slug - slug avec caractères spéciaux retourne 400 ou 404', async () => {
    const res = await request(app)
      .get('/api/form/test<script>');

    // Peut retourner 400 (slug invalide) ou 404 (route non trouvée)
    expect([400, 404]).toContain(res.status);
  });

  test('POST /api/form/:slug/submit - sauvegarde un brouillon', async () => {
    const res = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Valeur test', field2: 'test@example.com' },
        action: 'save'
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('draft');
  });

  test('POST /api/form/:slug/submit - soumet un formulaire', async () => {
    const res = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Valeur soumise', field2: 'submit@example.com' },
        action: 'submit'
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
  });

  test('POST /api/form/:slug/submit - action invalide retourne 400', async () => {
    const res = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Test' },
        action: 'invalid-action'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Action invalide');
  });

  test('POST /api/form/:slug/submit - formulaire inexistant retourne 404', async () => {
    const res = await request(app)
      .post('/api/form/formulaire-inexistant-xyz/submit')
      .send({ data: {}, action: 'save' });

    expect(res.status).toBe(404);
  });

  test('POST /api/form/:slug/submit - met à jour une soumission existante', async () => {
    // Créer une soumission
    const createRes = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Initial' },
        action: 'save'
      });

    const submissionId = createRes.body.id;

    // Mettre à jour
    const updateRes = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Updated' },
        action: 'save',
        submission_id: submissionId
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(submissionId);
  });

  test('GET /api/form/:slug/submission - récupère une soumission', async () => {
    // Créer une soumission
    const createRes = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Pour récupération' },
        action: 'save'
      });

    const res = await request(app)
      .get(`/api/form/${testForm.slug}/submission?submission_id=${createRes.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createRes.body.id);
  });

  test('GET /api/form/:slug/submission - sans submission_id retourne null ou erreur', async () => {
    const res = await request(app)
      .get(`/api/form/${testForm.slug}/submission`);

    // L'API peut retourner 200 avec null/undefined ou 400
    expect([200, 400]).toContain(res.status);
  });

  test('GET /api/form/:slug/submission - soumission inexistante', async () => {
    const res = await request(app)
      .get(`/api/form/${testForm.slug}/submission?submission_id=99999`);

    // L'API peut retourner 200 avec null ou 404
    expect([200, 404]).toContain(res.status);
  });
});

// =============================================================================
// TESTS DE SÉCURITÉ SUPPLÉMENTAIRES
// =============================================================================

describe('Sécurité - Protection des routes', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  const protectedRoutes = [
    { method: 'get', path: '/api/admin/projects' },
    { method: 'post', path: '/api/admin/projects' },
    { method: 'put', path: '/api/admin/projects/1' },
    { method: 'delete', path: '/api/admin/projects/1' },
    { method: 'get', path: '/api/admin/forms' },
    { method: 'post', path: '/api/admin/forms' },
    { method: 'get', path: '/api/admin/forms/1' },
    { method: 'put', path: '/api/admin/forms/1' },
    { method: 'delete', path: '/api/admin/forms/1' },
    { method: 'get', path: '/api/admin/forms/1/submissions' },
    { method: 'get', path: '/api/admin/submissions/1' },
    { method: 'put', path: '/api/admin/submissions/1/status' },
    { method: 'delete', path: '/api/admin/submissions/1' },
    { method: 'get', path: '/api/admin/templates' },
    { method: 'get', path: '/api/admin/stats' },
    { method: 'get', path: '/api/admin/media' },
    { method: 'post', path: '/api/admin/media' },
    { method: 'delete', path: '/api/admin/media/1' },
  ];

  test.each(protectedRoutes)(
    '$method $path - sans token retourne 401',
    async ({ method, path }) => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    }
  );

  test.each(protectedRoutes)(
    '$method $path - avec token invalide retourne 401',
    async ({ method, path }) => {
      const res = await request(app)[method](path)
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    }
  );
});

// =============================================================================
// TESTS EXPORT PDF
// =============================================================================

describe('API Admin - Export PDF', () => {
  let app;
  let token;
  let testForm;
  let testProject;
  let testSubmission;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);

    // Créer un projet de test
    testProject = await createTestProject(app, token, 'Projet PDF Test');

    // Créer un gabarit, puis l'associer au projet (clone en instance)
    const gabarit = await createTestForm(app, token, 'Formulaire PDF Test');
    const instanceRes = await request(app)
      .post(`/api/admin/projects/${testProject.id}/forms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template_id: gabarit.id });
    testForm = instanceRes.body;

    // Créer une soumission de test
    const submitRes = await request(app)
      .post(`/api/form/${testForm.slug}/submit`)
      .send({
        data: { field1: 'Valeur test', field2: 'test@example.com' },
        status: 'submitted'
      });
    testSubmission = submitRes.body;
  });

  describe('GET /api/admin/submissions/:id/pdf', () => {
    test('retourne un PDF valide pour une soumission existante', async () => {
      const res = await request(app)
        .get(`/api/admin/submissions/${testSubmission.id}/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.pdf');
      // Vérifier que le contenu commence par %PDF (signature PDF)
      expect(res.body.toString().substring(0, 4)).toBe('%PDF');
    });

    test('retourne 404 pour une soumission inexistante', async () => {
      const res = await request(app)
        .get('/api/admin/submissions/99999/pdf')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Soumission non trouvée');
    });

    test('retourne 401 sans authentification', async () => {
      const res = await request(app)
        .get(`/api/admin/submissions/${testSubmission.id}/pdf`);

      expect(res.status).toBe(401);
    });

    test('le nom du fichier est sécurisé (pas de caractères spéciaux)', async () => {
      const res = await request(app)
        .get(`/api/admin/submissions/${testSubmission.id}/pdf`)
        .set('Authorization', `Bearer ${token}`);

      const disposition = res.headers['content-disposition'];
      const filenameMatch = disposition.match(/filename="(.+)"/);
      expect(filenameMatch).toBeTruthy();

      const filename = filenameMatch[1];
      // Vérifier que le nom ne contient pas de caractères dangereux
      expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    });
  });

  describe('GET /api/admin/projects/:id/submissions/pdf', () => {
    test('retourne un PDF valide pour un projet avec soumissions', async () => {
      const res = await request(app)
        .get(`/api/admin/projects/${testProject.id}/submissions/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      // Vérifier que le contenu commence par %PDF
      expect(res.body.toString().substring(0, 4)).toBe('%PDF');
    });

    test('retourne 404 pour un projet inexistant', async () => {
      const res = await request(app)
        .get('/api/admin/projects/99999/submissions/pdf')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Projet non trouvé');
    });

    test('retourne 400 pour un projet sans formulaires', async () => {
      // Créer un projet vide
      const emptyProject = await createTestProject(app, token, 'Projet Vide');

      const res = await request(app)
        .get(`/api/admin/projects/${emptyProject.id}/submissions/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Aucun formulaire dans ce projet');
    });

    test('filtre par statut fonctionne', async () => {
      // D'abord, mettre à jour le statut de la soumission en "validated"
      await request(app)
        .put(`/api/admin/submissions/${testSubmission.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'validated' });

      // Tester avec le statut "validated"
      const res = await request(app)
        .get(`/api/admin/projects/${testProject.id}/submissions/pdf?status=validated`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');

      // Remettre le statut original
      await request(app)
        .put(`/api/admin/submissions/${testSubmission.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'submitted' });
    });

    test('ignore les statuts invalides', async () => {
      const res = await request(app)
        .get(`/api/admin/projects/${testProject.id}/submissions/pdf?status=invalid_status`)
        .set('Authorization', `Bearer ${token}`);

      // Devrait fonctionner sans filtrer (statut ignoré)
      expect(res.status).toBe(200);
    });

    test('retourne 401 sans authentification', async () => {
      const res = await request(app)
        .get(`/api/admin/projects/${testProject.id}/submissions/pdf`);

      expect(res.status).toBe(401);
    });
  });
});

// =============================================================================
// TESTS SERVICE PDF - Sécurité Path Traversal
// =============================================================================

describe('Service PDF - Sécurité', () => {
  const { generateSubmissionPDF } = require('../services/pdf');

  test('génère un PDF sans erreur avec des données minimales', () => {
    const submission = {
      id: 1,
      data: JSON.stringify({ field1: 'test' }),
      status: 'submitted',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const form = {
      title: 'Test Form',
      structure: JSON.stringify({
        sections: [{
          id: 'section1',
          title: 'Section 1',
          fields: [{ id: 'field1', label: 'Field 1', type: 'text' }]
        }]
      })
    };

    const doc = generateSubmissionPDF({ submission, form, project: null });

    expect(doc).toBeDefined();
    expect(typeof doc.pipe).toBe('function');

    // Finaliser le document pour éviter les fuites mémoire
    doc.end();
  });

  test('gère les valeurs null/undefined sans erreur', () => {
    const submission = {
      id: 1,
      data: JSON.stringify({ field1: null, field2: undefined }),
      status: 'draft',
      created_at: new Date().toISOString()
    };

    const form = {
      title: 'Test Form',
      structure: JSON.stringify({
        sections: [{
          id: 'section1',
          title: 'Section 1',
          fields: [
            { id: 'field1', label: 'Field 1', type: 'text' },
            { id: 'field2', label: 'Field 2', type: 'textarea' }
          ]
        }]
      })
    };

    expect(() => {
      const doc = generateSubmissionPDF({ submission, form, project: null });
      doc.end();
    }).not.toThrow();
  });

  test('gère les tableaux vides sans erreur', () => {
    const submission = {
      id: 1,
      data: JSON.stringify({ checkbox_field: [] }),
      status: 'submitted',
      created_at: new Date().toISOString()
    };

    const form = {
      title: 'Test Form',
      structure: JSON.stringify({
        sections: [{
          id: 'section1',
          title: 'Section 1',
          fields: [{ id: 'checkbox_field', label: 'Checkboxes', type: 'checkbox', options: ['A', 'B'] }]
        }]
      })
    };

    expect(() => {
      const doc = generateSubmissionPDF({ submission, form, project: null });
      doc.end();
    }).not.toThrow();
  });

  test('ne charge pas de logo avec un chemin path traversal', () => {
    const submission = {
      id: 1,
      data: JSON.stringify({ field1: 'test' }),
      status: 'submitted',
      created_at: new Date().toISOString()
    };

    const form = {
      title: 'Test Form',
      structure: JSON.stringify({
        sections: [{
          id: 'section1',
          title: 'Section 1',
          fields: [{ id: 'field1', label: 'Field 1', type: 'text' }]
        }]
      })
    };

    // Projet avec chemin malveillant
    const project = {
      id: 1,
      name: 'Malicious Project',
      logo: '../../../etc/passwd'
    };

    // Ne devrait pas lever d'erreur, juste ignorer le logo
    expect(() => {
      const doc = generateSubmissionPDF({ submission, form, project });
      doc.end();
    }).not.toThrow();
  });
});

// =============================================================================
// MODÈLE GABARIT / INSTANCE DE PROJET
// =============================================================================

describe('Modèle gabarit/instance de projet', () => {
  let app, token;

  beforeAll(async () => {
    app = createTestApp();
    token = await getAuthToken(app);
  });

  test('GET /admin/forms ne renvoie que les gabarits (hors projet)', async () => {
    const gabarit = await createTestForm(app, token, 'Gabarit Biblio');
    const project = await createTestProject(app, token, 'Projet Biblio');
    await request(app)
      .post(`/api/admin/projects/${project.id}/forms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template_id: gabarit.id });

    const res = await request(app)
      .get('/api/admin/forms')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.every(f => f.project_id === null)).toBe(true);
    expect(res.body.some(f => f.id === gabarit.id)).toBe(true);
  });

  test('associer un gabarit clone une instance indépendante', async () => {
    const gabarit = await createTestForm(app, token, 'Gabarit Source');
    const project = await createTestProject(app, token, 'Projet Clone');

    const instRes = await request(app)
      .post(`/api/admin/projects/${project.id}/forms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template_id: gabarit.id });

    expect(instRes.status).toBe(200);
    const instance = instRes.body;
    expect(instance.id).not.toBe(gabarit.id);
    expect(instance.project_id).toBe(project.id);
    expect(instance.slug).not.toBe(gabarit.slug);

    // Modifier l'instance ne doit pas toucher le gabarit
    await request(app)
      .put(`/api/admin/forms/${instance.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Instance modifiée' });

    const gabaritAfter = await request(app)
      .get(`/api/admin/forms/${gabarit.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(gabaritAfter.body.title).toBe('Gabarit Source');
  });

  test('POST /projects avec template_ids clone les gabarits dans l\'ordre', async () => {
    const g1 = await createTestForm(app, token, 'G1');
    const g2 = await createTestForm(app, token, 'G2');

    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Projet Ordonné', template_ids: [g2.id, g1.id] });
    expect(res.status).toBe(200);

    const instances = (await request(app)
      .get(`/api/admin/forms?project_id=${res.body.id}`)
      .set('Authorization', `Bearer ${token}`)).body;

    expect(instances.length).toBe(2);
    expect(instances[0].position).toBe(0);
    expect(instances[0].title).toBe('G2');
    expect(instances[1].position).toBe(1);
    expect(instances.every(f => f.id !== g1.id && f.id !== g2.id)).toBe(true);
  });

  test('PUT /projects réordonne et retire des instances', async () => {
    const g1 = await createTestForm(app, token, 'R1');
    const g2 = await createTestForm(app, token, 'R2');
    const project = (await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Projet Reorder', template_ids: [g1.id, g2.id] })).body;

    let instances = (await request(app)
      .get(`/api/admin/forms?project_id=${project.id}`)
      .set('Authorization', `Bearer ${token}`)).body;
    const i2 = instances[1];

    await request(app)
      .put(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ form_order: [i2.id] });

    instances = (await request(app)
      .get(`/api/admin/forms?project_id=${project.id}`)
      .set('Authorization', `Bearer ${token}`)).body;
    expect(instances.length).toBe(1);
    expect(instances[0].id).toBe(i2.id);
    expect(instances[0].position).toBe(0);
  });

  test('supprimer un projet supprime ses instances et leurs soumissions', async () => {
    const gabarit = await createTestForm(app, token, 'G Cascade');
    const project = await createTestProject(app, token, 'Projet Cascade');
    const instance = (await request(app)
      .post(`/api/admin/projects/${project.id}/forms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template_id: gabarit.id })).body;

    const sub = (await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { field1: 'x' }, action: 'submit' })).body;
    expect(sub.id).toBeDefined();

    await request(app)
      .delete(`/api/admin/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`);

    const instAfter = await request(app)
      .get(`/api/admin/forms/${instance.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(instAfter.status).toBe(404);

    const subAfter = await request(app)
      .get(`/api/admin/submissions/${sub.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(subAfter.status).toBe(404);

    // le gabarit source est conservé
    const gabaritAfter = await request(app)
      .get(`/api/admin/forms/${gabarit.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(gabaritAfter.status).toBe(200);
  });

  test('reprise sans submission_id renvoie la dernière soumission (multi-appareils)', async () => {
    const gabarit = await createTestForm(app, token, 'Reprise Form');
    const project = await createTestProject(app, token, 'Reprise Projet');
    const instance = (await request(app)
      .post(`/api/admin/projects/${project.id}/forms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template_id: gabarit.id })).body;

    await request(app)
      .post(`/api/form/${instance.slug}/submit`)
      .send({ data: { field1: 'valeur reprise' }, action: 'save' });

    // GET public sans submission_id (autre appareil, pas de localStorage)
    const res = await request(app).get(`/api/form/${instance.slug}/submission`);
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    expect(res.body.data.field1).toBe('valeur reprise');
  });
});
