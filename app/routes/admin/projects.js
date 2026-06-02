const express = require('express');
const router = express.Router();
const db = require('../../database');
const path = require('path');
const fs = require('fs');
const { authMiddleware, parseId } = require('./auth');
const { upload, validateFileContent, uploadsDir } = require('./upload');
const { nanoid } = require('../../utils/nanoid');

// Clone un formulaire (gabarit) en instance indépendante rattachée à un projet.
function instantiateTemplate(templateId, projectId, position) {
  const tpl = db.prepare('SELECT title, structure, status FROM forms WHERE id = ?').get(templateId);
  if (!tpl) return null;
  const result = db.prepare(
    'INSERT INTO forms (title, project_id, slug, structure, status, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(tpl.title, projectId, nanoid(12), tpl.structure, tpl.status, position);
  return result.lastInsertRowid;
}

// Lister les projets
router.get('/', authMiddleware, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, COUNT(f.id) as forms_count
    FROM projects p
    LEFT JOIN forms f ON f.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

// Créer un projet. template_ids = gabarits à instancier (clonés), dans l'ordre.
router.post('/', authMiddleware, (req, res) => {
  const { name, style, template_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });

  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO projects (name, slug, style) VALUES (?, ?, ?)')
      .run(name, nanoid(10), style || 'google');
    const projectId = result.lastInsertRowid;
    if (Array.isArray(template_ids)) {
      template_ids
        .filter(id => Number.isInteger(id) && id > 0)
        .forEach((tplId, index) => instantiateTemplate(tplId, projectId, index));
    }
    return projectId;
  });

  const projectId = create();
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId));
});

// Modifier un projet
router.put('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const { name, slug, shared_sections, form_order, style, logo } = req.body;

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Projet non trouvé' });

  if (slug && slug !== existing.slug) {
    const slugExists = db.prepare('SELECT id FROM projects WHERE slug = ? AND id != ?').get(slug, id);
    if (slugExists) return res.status(400).json({ error: 'Ce slug est déjà utilisé' });
  }

  const apply = db.transaction(() => {
    db.prepare('UPDATE projects SET name = ?, slug = ?, shared_sections = ?, style = ?, logo = ? WHERE id = ?').run(
      name || existing.name,
      slug || existing.slug,
      shared_sections ? JSON.stringify(shared_sections) : existing.shared_sections,
      style || existing.style || 'google',
      logo !== undefined ? logo : existing.logo,
      id
    );

    // form_order = liste ordonnée d'IDs d'INSTANCES à conserver. Les instances
    // absentes sont supprimées (soumissions en cascade) ; les autres réordonnées.
    if (Array.isArray(form_order)) {
      const wanted = form_order.filter(fid => Number.isInteger(fid) && fid > 0);
      const wantedSet = new Set(wanted);
      const current = db.prepare('SELECT id FROM forms WHERE project_id = ?').all(id).map(f => f.id);
      for (const fid of current) {
        if (!wantedSet.has(fid)) db.prepare('DELETE FROM forms WHERE id = ? AND project_id = ?').run(fid, id);
      }
      wanted.forEach((fid, index) => {
        db.prepare('UPDATE forms SET position = ? WHERE id = ? AND project_id = ?').run(index, fid, id);
      });
    }
  });
  apply();

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

// Ajouter un formulaire au projet : clone un gabarit en instance, en fin de liste.
router.post('/:id/forms', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const templateId = parseId(req.body.template_id);
  if (!templateId) return res.status(400).json({ error: 'template_id invalide' });

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Projet non trouvé' });

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM forms WHERE project_id = ?').get(id).m;
  const instanceId = instantiateTemplate(templateId, id, maxPos + 1);
  if (!instanceId) return res.status(404).json({ error: 'Gabarit introuvable' });

  res.json(db.prepare('SELECT * FROM forms WHERE id = ?').get(instanceId));
});

// Upload du logo
router.post('/:id/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Projet non trouvé' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier uploadé' });

  try {
    const validation = await validateFileContent(req.file.path, req.file.mimetype);
    if (!validation.valid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: validation.reason });
    }
  } catch (err) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Erreur lors de la validation du fichier' });
  }

  if (existing.logo) {
    const oldLogoPath = path.join(uploadsDir, path.basename(existing.logo));
    try { fs.unlinkSync(oldLogoPath); } catch {}
  }

  const logoUrl = '/uploads/logos/' + req.file.filename;
  db.prepare('UPDATE projects SET logo = ? WHERE id = ?').run(logoUrl, id);
  res.json({ logo: logoUrl });
});

// Supprimer le logo
router.delete('/:id/logo', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Projet non trouvé' });

  if (existing.logo) {
    const logoPath = path.join(uploadsDir, path.basename(existing.logo));
    try { fs.unlinkSync(logoPath); } catch {}
  }

  db.prepare('UPDATE projects SET logo = NULL WHERE id = ?').run(id);
  res.json({ success: true });
});

// Supprimer un projet, ses instances de formulaires et leurs soumissions.
router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });

  const remove = db.transaction(() => {
    db.prepare('DELETE FROM forms WHERE project_id = ?').run(id); // soumissions supprimées en cascade (FK)
    return db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
  const result = remove();
  if (result.changes === 0) return res.status(404).json({ error: 'Projet non trouvé' });
  res.json({ success: true });
});

module.exports = router;
