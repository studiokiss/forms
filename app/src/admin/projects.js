import { state } from './state.js';
import { escapeHtml, formatDate, openModal, closeModal } from './utils.js';
import { api } from './api.js';
import { loadForms, editForm } from './forms.js';

// ======== PROJECTS ========
// Projects
async function loadProjects() {
    state.projects = await api('/admin/projects');

    if (state.projects.length === 0) {
        document.getElementById('projects-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucun projet</div>
                <p>Créez votre premier projet pour organiser vos formulaires.</p>
            </div>
        `;
    } else {
        document.getElementById('projects-list').innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Lien client</th>
                        <th>Formulaires</th>
                        <th>Soumissions</th>
                        <th>Créé le</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.projects.map(p => {
                        const formsCount = parseInt(p.forms_count) || 0;
                        return `
                        <tr>
                            <td><strong>${escapeHtml(p.name)}</strong></td>
                            <td>${p.slug ? `<a href="/p/${encodeURIComponent(p.slug)}" target="_blank" class="btn btn-sm btn-secondary">Ouvrir</a>` : '-'}</td>
                            <td>${parseInt(formsCount)}</td>
                            <td><button class="btn btn-sm btn-secondary" onclick="viewProjectSubmissions(${parseInt(p.id)})">Voir</button></td>
                            <td>${escapeHtml(formatDate(p.created_at))}</td>
                            <td class="table-actions">
                                <button class="btn btn-sm btn-secondary" onclick="editProject(${parseInt(p.id)})">Modifier</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteProject(${parseInt(p.id)})">Supprimer</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
    }
}


async function openProjectModal(project = null) {
    // Bibliothèque de gabarits (formulaires hors projet)
    state.forms = await api('/admin/forms');

    document.getElementById('modal-project-title').textContent = project ? 'Modifier le projet' : 'Nouveau projet';
    document.getElementById('project-name-input').value = project?.name || '';
    document.getElementById('project-name-input').dataset.id = project?.id || '';
    document.getElementById('project-webhook-input').value = project?.discord_webhook || '';

    // Reset logo state
    state.currentProjectLogo = project?.logo || null;
    state.pendingLogoFile = null;
    document.getElementById('logo-input').value = '';

    // Afficher le logo existant ou cacher le preview
    if (state.currentProjectLogo) {
        document.getElementById('logo-preview').src = state.currentProjectLogo;
        document.getElementById('logo-preview-container').style.display = 'flex';
        document.getElementById('logo-upload-container').style.display = 'none';
    } else {
        document.getElementById('logo-preview-container').style.display = 'none';
        document.getElementById('logo-upload-container').style.display = 'block';
    }

    // Sélectionner le style du projet
    const style = project?.style || 'google';
    document.querySelectorAll('input[name="project-style"]').forEach(radio => {
        radio.checked = radio.value === style;
    });

    // Bibliothèque de gabarits à ajouter (cocher = cloner dans le projet)
    const formsAvailable = document.getElementById('project-forms-available');
    formsAvailable.innerHTML = state.forms.length
        ? state.forms.map(f => `
            <label class="checkbox-item">
                <input type="checkbox" value="${parseInt(f.id)}" onchange="toggleProjectForm(this)">
                <span>${escapeHtml(f.title)}</span>
            </label>
        `).join('')
        : '<p style="color: var(--gray-500); font-size: 13px;">Aucun gabarit. Créez des formulaires dans l\'onglet Formulaires.</p>';

    // Formulaires du projet : les instances existantes (en édition)
    const formsList = document.getElementById('project-forms-list');
    formsList.innerHTML = '';
    if (project?.id) {
        const instances = await api(`/admin/forms?project_id=${project.id}`);
        formsList.innerHTML = instances.map(f =>
            renderProjectItem({ kind: 'instance', id: f.id, title: f.title })
        ).join('');
    }
    refreshProjectItemsUI();

    openModal('modal-project');
}

// Une ligne de la composition du projet : instance existante ou gabarit à cloner.
function renderProjectItem(item) {
    const isInstance = item.kind === 'instance';
    return `
        <div class="sortable-item" draggable="true" data-id="${parseInt(item.id)}" data-kind="${escapeHtml(item.kind)}">
            <span class="item-number"></span>
            <span class="drag-handle">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                </svg>
            </span>
            <div class="item-info"><div class="item-title">${escapeHtml(item.title)}</div></div>
            <div class="item-actions">
                ${isInstance
                    ? `<button type="button" class="btn btn-sm btn-secondary" onclick="editProjectInstance(${parseInt(item.id)})">Modifier</button>`
                    : '<span class="badge badge-draft">à ajouter</span>'}
                <button type="button" class="btn btn-sm btn-danger" onclick="removeProjectFormItem(this)">Retirer</button>
            </div>
        </div>
    `;
}

// Cocher/décocher un gabarit : l'ajoute/retire de la composition (clone à l'enregistrement).
function toggleProjectForm(checkbox) {
    const id = parseInt(checkbox.value);
    const list = document.getElementById('project-forms-list');
    if (checkbox.checked) {
        const gabarit = state.forms.find(f => f.id === id);
        if (gabarit) list.insertAdjacentHTML('beforeend', renderProjectItem({ kind: 'template', id, title: gabarit.title }));
    } else {
        const item = list.querySelector(`.sortable-item[data-kind="template"][data-id="${id}"]`);
        if (item) item.remove();
    }
    refreshProjectItemsUI();
}

function removeProjectFormItem(btn) {
    const item = btn.closest('.sortable-item');
    if (!item) return;
    if (item.dataset.kind === 'template') {
        const cb = document.querySelector(`#project-forms-available input[value="${item.dataset.id}"]`);
        if (cb) cb.checked = false;
    }
    item.remove();
    refreshProjectItemsUI();
}

function editProjectInstance(id) {
    closeModal('modal-project');
    editForm(id);
}

function refreshProjectItemsUI() {
    const list = document.getElementById('project-forms-list');
    const items = Array.from(list.querySelectorAll('.sortable-item'));
    const placeholder = list.querySelector('.forms-placeholder');

    if (items.length === 0) {
        if (!placeholder) {
            list.insertAdjacentHTML('beforeend',
                '<p class="forms-placeholder" style="color: var(--gray-500); font-size: 13px;">Cochez des gabarits ci-dessus pour composer le projet.</p>');
        }
        return;
    }

    if (placeholder) placeholder.remove();
    items.forEach((item, i) => {
        const numberEl = item.querySelector('.item-number');
        if (numberEl) numberEl.textContent = i + 1;
    });
    setupSortable(list);
}

function setupSortable(container) {
    const items = container.querySelectorAll('.sortable-item');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            setTimeout(() => item.classList.add('dragging'), 0);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
            updateSortableNumbers(container);
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedItem && draggedItem !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(draggedItem, item);
                } else {
                    container.insertBefore(draggedItem, item.nextSibling);
                }
            }
        });
    });
}

function updateSortableNumbers(container) {
    const items = container.querySelectorAll('.sortable-item');
    items.forEach((item, i) => {
        const numberEl = item.querySelector('.item-number');
        if (numberEl) numberEl.textContent = i + 1;
    });
}

function collectProjectItems() {
    const items = document.querySelectorAll('#project-forms-list .sortable-item');
    return Array.from(items).map(item => ({ kind: item.dataset.kind, id: parseInt(item.dataset.id) }));
}

async function saveProject() {
    const name = document.getElementById('project-name-input').value.trim();
    const id = document.getElementById('project-name-input').dataset.id;
    const style = document.querySelector('input[name="project-style"]:checked')?.value || 'google';
    const discordWebhook = document.getElementById('project-webhook-input').value.trim();

    if (!name) {
        alert('Le nom est requis');
        return;
    }

    try {
        const items = collectProjectItems();
        let projectId = id;

        if (id) {
            // Édition : cloner les gabarits ajoutés, puis fixer l'ordre des instances.
            const order = [];
            for (const item of items) {
                if (item.kind === 'instance') {
                    order.push(item.id);
                } else {
                    const inst = await api(`/admin/projects/${id}/forms`, {
                        method: 'POST',
                        body: JSON.stringify({ template_id: item.id })
                    });
                    order.push(inst.id);
                }
            }
            await api(`/admin/projects/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ name, style, form_order: order, discord_webhook: discordWebhook })
            });
        } else {
            // Création : clone les gabarits choisis (dans l'ordre).
            const newProject = await api('/admin/projects', {
                method: 'POST',
                body: JSON.stringify({ name, style, template_ids: items.map(i => i.id), discord_webhook: discordWebhook })
            });
            projectId = newProject.id;
        }

        // Gérer le logo
        const existingProject = id ? state.projects.find(p => p.id === parseInt(id)) : null;
        const existingLogo = existingProject?.logo || null;

        if (state.pendingLogoFile && projectId) {
            // Nouveau fichier uploadé - upload via API
            const formData = new FormData();
            formData.append('logo', state.pendingLogoFile);

            const uploadResponse = await fetch(`/api/admin/projects/${projectId}/logo`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.token}`
                },
                body: formData
            });

            // Ajouter aussi à la médiathèque
            const mediaFormData = new FormData();
            mediaFormData.append('file', state.pendingLogoFile);
            await fetch('/api/admin/media', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.token}`
                },
                body: mediaFormData
            });
        } else if (state.currentProjectLogo && state.currentProjectLogo !== existingLogo) {
            // Logo sélectionné depuis la médiathèque - juste mettre à jour le chemin
            await api(`/admin/projects/${projectId}`, {
                method: 'PUT',
                body: JSON.stringify({ logo: state.currentProjectLogo })
            });
        } else if (state.currentProjectLogo === null && existingLogo) {
            // Logo supprimé
            await fetch(`/api/admin/projects/${id}/logo`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${state.token}`
                }
            });
        }

        closeModal('modal-project');
        loadProjects();
    } catch (error) {
        alert(error.message);
    }
}

function previewLogo(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        state.pendingLogoFile = file;

        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('logo-preview').src = e.target.result;
            document.getElementById('logo-preview-container').style.display = 'flex';
            document.getElementById('logo-upload-container').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

function removeLogo() {
    state.currentProjectLogo = null;
    state.pendingLogoFile = null;
    document.getElementById('logo-input').value = '';
    document.getElementById('logo-preview-container').style.display = 'none';
    document.getElementById('logo-upload-container').style.display = 'block';
}

// Envoie un message de test sur l'URL saisie (avant même la sauvegarde du projet).
async function testProjectWebhook() {
    const url = document.getElementById('project-webhook-input').value.trim();
    if (!url) {
        alert('Renseignez d\'abord l\'URL du webhook Discord');
        return;
    }

    const btn = document.getElementById('project-webhook-test-btn');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
        await api('/admin/projects/webhook-test', {
            method: 'POST',
            body: JSON.stringify({ url })
        });
        alert('Message de test envoyé — vérifiez le salon Discord');
    } catch (error) {
        alert('Échec : ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Tester';
    }
}

// ============ MÉDIATHÈQUE ============


async function openMediaLibrary() {
    await loadMediaLibrary();
    openModal('modal-media');
}

async function loadMediaLibrary() {
    try {
        state.mediaLibrary = await api('/admin/media');
        renderMediaGrid();
    } catch (error) {
        console.error('Erreur chargement médiathèque:', error);
    }
}

function renderMediaGrid() {
    const grid = document.getElementById('media-grid');
    const emptyState = document.getElementById('media-empty');

    if (state.mediaLibrary.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = state.mediaLibrary.map(media => `
        <div class="media-item" onclick="selectMedia('${escapeHtml(media.path)}')" title="${escapeHtml(media.original_name)}">
            <img src="${escapeHtml(media.path)}" alt="${escapeHtml(media.original_name)}">
            <div class="media-item-actions">
                <button class="media-item-delete" onclick="event.stopPropagation(); deleteMedia(${parseInt(media.id)})" title="Supprimer">×</button>
            </div>
        </div>
    `).join('');
}

async function uploadMedia(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/admin/media', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        if (!response.ok) throw new Error('Erreur upload');

        const media = await response.json();
        state.mediaLibrary.unshift(media);
        renderMediaGrid();
        input.value = '';
    } catch (error) {
        alert('Erreur lors de l\'upload');
    }
}

async function deleteMedia(id) {
    if (!window.confirm('Supprimer cette image ?')) return;

    try {
        await api(`/admin/media/${id}`, { method: 'DELETE' });
        state.mediaLibrary = state.mediaLibrary.filter(m => m.id !== id);
        renderMediaGrid();
    } catch (error) {
        alert('Erreur lors de la suppression');
    }
}

function selectMedia(path) {
    // Sélectionner l'image pour le logo du projet
    state.currentProjectLogo = path;
    state.pendingLogoFile = null;

    document.getElementById('logo-preview').src = path;
    document.getElementById('logo-preview-container').style.display = 'flex';
    document.getElementById('logo-upload-container').style.display = 'none';

    closeModal('modal-media');
}

async function editProject(id) {
    const project = state.projects.find(p => p.id === id);
    openProjectModal(project);
}

async function deleteProject(id) {
    const project = state.projects.find(p => p.id === id);
    const name = project ? project.name : '';

    // Confirmation forte : la suppression est destructive (formulaires + soumissions
    // effacés en cascade). On exige la saisie du nom exact du projet.
    const typed = window.prompt(
        `Suppression DÉFINITIVE du projet « ${name} » : ses formulaires et toutes leurs soumissions seront effacés, sans retour possible.\n\nPour confirmer, tape le nom exact du projet :`
    );
    if (typed === null) return;
    if (typed.trim() !== name) {
        alert('Le nom ne correspond pas — suppression annulée.');
        return;
    }

    try {
        await api(`/admin/projects/${id}`, { method: 'DELETE' });
        loadProjects();
        loadForms();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}



export { loadProjects };
export { openProjectModal };
export { toggleProjectForm };
export { removeProjectFormItem };
export { editProjectInstance };
export { setupSortable };
export { updateSortableNumbers };
export { saveProject };
export { previewLogo };
export { removeLogo };
export { testProjectWebhook };
export { openMediaLibrary };
export { loadMediaLibrary };
export { renderMediaGrid };
export { uploadMedia };
export { deleteMedia };
export { selectMedia };
export { editProject };
export { deleteProject };
