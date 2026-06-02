const express = require('express');
const router = express.Router();
const db = require('../database');

// ============ PROJETS ============

// Récupérer un projet par son slug (avec formulaires et données partagées)
router.get('/project/:slug', (req, res) => {
  const { slug } = req.params;

  // Validation du slug (alphanum + tirets uniquement)
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug invalide' });
  }

  const project = db.prepare(`
    SELECT id, name, slug, shared_sections, style, logo
    FROM projects
    WHERE slug = ?
  `).get(slug);

  if (!project) {
    return res.status(404).json({ error: 'Projet non trouvé' });
  }

  // Instances actives du projet, dans l'ordre (source de vérité : project_id + position)
  const formsWithStatus = db.prepare(`
    SELECT id, title, slug, status
    FROM forms
    WHERE project_id = ? AND status = 'active'
    ORDER BY position ASC
  `).all(project.id).map(form => {
    const submission = db.prepare(`
      SELECT status FROM submissions WHERE form_id = ? ORDER BY updated_at DESC LIMIT 1
    `).get(form.id);
    return { ...form, submission_status: submission?.status || null };
  });

  // Récupérer les données partagées
  const projectData = db.prepare(`
    SELECT data FROM project_data WHERE project_id = ?
  `).get(project.id);

  res.json({
    id: project.id,
    name: project.name,
    slug: project.slug,
    style: project.style || 'google',
    logo: project.logo || null,
    shared_sections: JSON.parse(project.shared_sections || '[]'),
    shared_data: projectData ? JSON.parse(projectData.data) : {},
    forms: formsWithStatus
  });
});

// Sauvegarder les données partagées du projet
router.post('/project/:slug/shared-data', (req, res) => {
  const { slug } = req.params;
  const { data } = req.body;

  // Validation du slug
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug invalide' });
  }

  const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug);
  if (!project) {
    return res.status(404).json({ error: 'Projet non trouvé' });
  }

  const existing = db.prepare('SELECT id FROM project_data WHERE project_id = ?').get(project.id);
  const dataJson = JSON.stringify(data);

  if (existing) {
    db.prepare(`
      UPDATE project_data SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?
    `).run(dataJson, project.id);
  } else {
    db.prepare(`
      INSERT INTO project_data (project_id, data) VALUES (?, ?)
    `).run(project.id, dataJson);
  }

  res.json({ success: true });
});

// ============ FORMULAIRES ============

// Récupérer un formulaire par son slug
router.get('/form/:slug', (req, res) => {
  const { slug } = req.params;

  // Validation du slug
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug invalide' });
  }

  const form = db.prepare(`
    SELECT id, title, slug, structure, status
    FROM forms
    WHERE slug = ?
  `).get(slug);

  if (!form) {
    return res.status(404).json({ error: 'Formulaire non trouvé' });
  }

  if (form.status !== 'active') {
    return res.status(403).json({ error: 'Ce formulaire n\'est plus disponible' });
  }

  res.json({
    id: form.id,
    title: form.title,
    slug: form.slug,
    structure: JSON.parse(form.structure)
  });
});

// Récupérer une soumission existante (pour continuer à remplir)
router.get('/form/:slug/submission', (req, res) => {
  const { slug } = req.params;
  const { submission_id } = req.query;

  // Validation du slug
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug invalide' });
  }

  // Validation du submission_id si présent
  if (submission_id && !/^\d+$/.test(submission_id)) {
    return res.status(400).json({ error: 'ID de soumission invalide' });
  }

  const form = db.prepare('SELECT id FROM forms WHERE slug = ?').get(slug);
  if (!form) {
    return res.status(404).json({ error: 'Formulaire non trouvé' });
  }

  if (submission_id) {
    const submission = db.prepare(`
      SELECT * FROM submissions
      WHERE id = ? AND form_id = ?
    `).get(submission_id, form.id);

    if (submission) {
      return res.json({
        id: submission.id,
        data: JSON.parse(submission.data),
        status: submission.status,
        updated_at: submission.updated_at
      });
    }
  }

  res.json(null);
});

// Soumettre / sauvegarder un formulaire
router.post('/form/:slug/submit', (req, res) => {
  const { slug } = req.params;
  const { data, submission_id, action } = req.body; // action: 'save' ou 'submit'

  // Validation du slug
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug invalide' });
  }

  // Validation des données
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  // Validation du submission_id si présent
  const parsedSubmissionId = submission_id ? parseInt(submission_id, 10) : null;
  if (submission_id && (isNaN(parsedSubmissionId) || parsedSubmissionId <= 0)) {
    return res.status(400).json({ error: 'ID de soumission invalide' });
  }

  // Validation de l'action
  if (action && !['save', 'submit'].includes(action)) {
    return res.status(400).json({ error: 'Action invalide' });
  }

  const form = db.prepare('SELECT id, status FROM forms WHERE slug = ?').get(slug);

  if (!form) {
    return res.status(404).json({ error: 'Formulaire non trouvé' });
  }

  if (form.status !== 'active') {
    return res.status(403).json({ error: 'Ce formulaire n\'est plus disponible' });
  }

  const dataJson = JSON.stringify(data);
  const newStatus = action === 'submit' ? 'submitted' : 'draft';

  let submission;
  let wasAlreadySubmitted = false;

  if (parsedSubmissionId) {
    // Vérifier si la soumission existait déjà en statut 'submitted'
    const existing = db.prepare('SELECT status FROM submissions WHERE id = ? AND form_id = ?').get(parsedSubmissionId, form.id);

    if (existing) {
      wasAlreadySubmitted = existing.status === 'submitted' || existing.status === 'validated';

      // Mise à jour
      db.prepare(`
        UPDATE submissions
        SET data = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND form_id = ?
      `).run(dataJson, newStatus, parsedSubmissionId, form.id);

      submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(parsedSubmissionId);
    }
  }

  if (!submission) {
    // Nouvelle soumission
    const result = db.prepare(`
      INSERT INTO submissions (form_id, data, status)
      VALUES (?, ?, ?)
    `).run(form.id, dataJson, newStatus);

    submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(result.lastInsertRowid);
  }

  res.json({
    id: submission.id,
    status: submission.status,
    updated_at: submission.updated_at,
    was_already_submitted: wasAlreadySubmitted,
    message: action === 'submit'
      ? (wasAlreadySubmitted
        ? 'Vos modifications ont été enregistrées. Studio Kiss sera notifié de ces changements.'
        : 'Votre formulaire a été soumis avec succès !')
      : 'Brouillon sauvegardé'
  });
});

module.exports = router;
