const express = require('express');
const router = express.Router();
const db = require('../../database');
const { authMiddleware, parseId } = require('./auth');
const { nanoid } = require('../../utils/nanoid');

const VALID_FORM_STATUSES = ['draft', 'active'];

// Lister les formulaires
router.get('/', authMiddleware, (req, res) => {
  const { project_id } = req.query;

  let query = `
    SELECT f.*, p.name as project_name,
    (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id) as submissions_count
    FROM forms f
    LEFT JOIN projects p ON p.id = f.project_id
  `;

  const params = [];
  if (project_id) {
    // Instances d'un projet, dans l'ordre défini.
    const parsedProjectId = parseId(project_id);
    if (!parsedProjectId) return res.status(400).json({ error: 'ID de projet invalide' });
    query += ' WHERE f.project_id = ? ORDER BY f.position ASC';
    params.push(parsedProjectId);
  } else {
    // Bibliothèque : uniquement les gabarits (hors projet).
    query += ' WHERE f.project_id IS NULL ORDER BY f.created_at DESC';
  }

  res.json(db.prepare(query).all(...params));
});

// Créer un formulaire
router.post('/', authMiddleware, async (req, res) => {
  const { title, project_id, structure, template_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Le titre est requis' });

  let formStructure = structure;

  if (template_id && !structure) {
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(template_id);
    if (template) formStructure = template.structure;
  }

  if (!formStructure) {
    formStructure = { title, description: 'Studio Kiss', sections: [] };
  }

  const slug = nanoid(12);

  const result = db.prepare('INSERT INTO forms (title, project_id, slug, structure) VALUES (?, ?, ?, ?)')
    .run(title, project_id || null, slug, typeof formStructure === 'string' ? formStructure : JSON.stringify(formStructure));

  res.json(db.prepare('SELECT * FROM forms WHERE id = ?').get(result.lastInsertRowid));
});

// Détail d'un formulaire
router.get('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const form = db.prepare(`
    SELECT f.*, p.name as project_name FROM forms f
    LEFT JOIN projects p ON p.id = f.project_id WHERE f.id = ?
  `).get(id);

  if (!form) return res.status(404).json({ error: 'Formulaire non trouvé' });
  res.json(form);
});

// Modifier un formulaire
router.put('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const { title, project_id, structure, status } = req.body;

  if (status && !VALID_FORM_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Statut de formulaire invalide' });
  }

  const existing = db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Formulaire non trouvé' });

  db.prepare('UPDATE forms SET title = ?, project_id = ?, structure = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(
      title || existing.title,
      project_id !== undefined ? project_id : existing.project_id,
      structure ? (typeof structure === 'string' ? structure : JSON.stringify(structure)) : existing.structure,
      status || existing.status,
      id
    );

  res.json(db.prepare('SELECT * FROM forms WHERE id = ?').get(id));
});

// Supprimer un formulaire
router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const result = db.prepare('DELETE FROM forms WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Formulaire non trouvé' });
  res.json({ success: true });
});

// Dupliquer un formulaire
router.post('/:id/duplicate', authMiddleware, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const { title } = req.body;
  const original = db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
  if (!original) return res.status(404).json({ error: 'Formulaire non trouvé' });

  const slug = nanoid(12);

  const result = db.prepare('INSERT INTO forms (title, project_id, slug, structure) VALUES (?, ?, ?, ?)')
    .run(title || `${original.title} (copie)`, original.project_id, slug, original.structure);

  res.json(db.prepare('SELECT * FROM forms WHERE id = ?').get(result.lastInsertRowid));
});

module.exports = router;
