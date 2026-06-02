const express = require('express');
const router = express.Router();
const db = require('../../database');
const archiver = require('archiver');
const { authMiddleware, parseId } = require('./auth');
const { VALID_SUBMISSION_STATUSES } = require('./submissions');
const { generateSubmissionPDF, generateProjectPDF } = require('../../services/pdf');
const { generateSubmissionJPG, generateProjectJPGs } = require('../../services/jpg');
const { sanitizeFilename } = require('../../services/export-utils');

// Récupère les soumissions d'un projet (logique partagée PDF/JPG)
function getProjectSubmissions(projectId, statusFilter) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return { error: 'Projet non trouvé', status: 404 };

  // Instances du projet, dans l'ordre (source de vérité : project_id + position)
  const formIds = db.prepare('SELECT id FROM forms WHERE project_id = ? ORDER BY position ASC')
    .all(projectId).map(f => f.id);

  if (formIds.length === 0) return { error: 'Aucun formulaire dans ce projet', status: 400 };

  const submissionsData = [];
  for (const formId of formIds) {
    let query = `
      SELECT s.*, f.title as form_title, f.structure as form_structure
      FROM submissions s JOIN forms f ON f.id = s.form_id WHERE s.form_id = ?
    `;
    const params = [formId];

    if (statusFilter && VALID_SUBMISSION_STATUSES.includes(statusFilter)) {
      query += ' AND s.status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY s.updated_at DESC LIMIT 1';
    const submission = db.prepare(query).get(...params);

    if (submission) {
      submissionsData.push({
        submission,
        form: { title: submission.form_title, structure: submission.form_structure }
      });
    }
  }

  if (submissionsData.length === 0) return { error: 'Aucune soumission à exporter', status: 400 };

  return { project, submissionsData };
}

// Export soumission PDF
router.get('/submissions/:id/pdf', authMiddleware, (req, res) => {
  const numericId = parseId(req.params.id);
  if (!numericId) return res.status(400).json({ error: 'ID invalide' });

  try {
    const submission = db.prepare(`
      SELECT s.*, f.title as form_title, f.structure as form_structure, f.project_id
      FROM submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?
    `).get(numericId);

    if (!submission) return res.status(404).json({ error: 'Soumission non trouvée' });

    let project = null;
    if (submission.project_id) {
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(submission.project_id);
    }

    const form = { title: submission.form_title, structure: submission.form_structure };
    const doc = generateSubmissionPDF({ submission, form, project });

    const safeProject = project ? sanitizeFilename(project.name, 30) : '';
    const safeForm = sanitizeFilename(submission.form_title || 'soumission', 30);
    const filename = safeProject ? `${safeProject}_${safeForm}_${numericId}.pdf` : `${safeForm}_${numericId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.on('error', (err) => {
      console.error('Erreur génération PDF:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur génération PDF' });
    });
    doc.pipe(res);
    doc.end();
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
});

// Export projet PDF
router.get('/projects/:id/submissions/pdf', authMiddleware, (req, res) => {
  const numericId = parseId(req.params.id);
  if (!numericId) return res.status(400).json({ error: 'ID invalide' });

  try {
    const result = getProjectSubmissions(numericId, req.query.status);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { project, submissionsData } = result;
    const doc = generateProjectPDF({ submissions: submissionsData, project });

    const date = new Date().toISOString().split('T')[0];
    const filename = `${sanitizeFilename(project.name)}_soumissions_${date}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.on('error', (err) => {
      console.error('Erreur génération PDF projet:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur génération PDF' });
    });
    doc.pipe(res);
    doc.end();
  } catch (error) {
    console.error('Erreur génération PDF projet:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
});

// Export soumission JPG
router.get('/submissions/:id/jpg', authMiddleware, async (req, res) => {
  const numericId = parseId(req.params.id);
  if (!numericId) return res.status(400).json({ error: 'ID invalide' });

  try {
    const submission = db.prepare(`
      SELECT s.*, f.title as form_title, f.structure as form_structure, f.project_id
      FROM submissions s JOIN forms f ON f.id = s.form_id WHERE s.id = ?
    `).get(numericId);

    if (!submission) return res.status(404).json({ error: 'Soumission non trouvée' });

    let project = null;
    if (submission.project_id) {
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(submission.project_id);
    }

    const jpgBuffer = await generateSubmissionJPG({
      submission,
      form: { title: submission.form_title, structure: submission.form_structure },
      project
    });

    const filename = `${sanitizeFilename(submission.form_title || 'formulaire')}_${numericId}.jpg`;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(jpgBuffer);
  } catch (error) {
    console.error('Erreur génération JPG:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du JPG' });
  }
});

// Export projet JPG (ZIP)
router.get('/projects/:id/submissions/jpg', authMiddleware, async (req, res) => {
  const numericId = parseId(req.params.id);
  if (!numericId) return res.status(400).json({ error: 'ID invalide' });

  try {
    const result = getProjectSubmissions(numericId, req.query.status);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { project, submissionsData } = result;
    const jpgs = await generateProjectJPGs({ submissions: submissionsData, project });
    if (jpgs.length === 0) return res.status(400).json({ error: 'Aucun contenu à exporter' });

    const date = new Date().toISOString().split('T')[0];
    const zipFilename = `${sanitizeFilename(project.name)}_${date}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Erreur ZIP:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur création ZIP' });
    });
    archive.pipe(res);

    jpgs.forEach((jpg, index) => {
      archive.append(jpg.buffer, { name: `${String(index + 1).padStart(2, '0')}_${jpg.filename}` });
    });

    await archive.finalize();
  } catch (error) {
    console.error('Erreur génération JPG projet:', error);
    res.status(500).json({ error: 'Erreur lors de la génération des JPG' });
  }
});

module.exports = router;
