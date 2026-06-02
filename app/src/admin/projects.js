import { state } from './state.js';
import { escapeHtml, formatDate, openModal, closeModal, customConfirm } from './utils.js';
import { api } from './api.js';
import { loadForms } from './forms.js';

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
                        const formsCount = p.form_order ? JSON.parse(p.form_order).length : 0;
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
    // Charger les state.forms d'abord si pas encore fait
    if (state.forms.length === 0) {
        state.forms = await api('/admin/forms');
    }

    document.getElementById('modal-project-title').textContent = project ? 'Modifier le projet' : 'Nouveau projet';
    document.getElementById('project-name-input').value = project?.name || '';
    document.getElementById('project-name-input').dataset.id = project?.id || '';

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

    const formsAvailable = document.getElementById('project-forms-available');
    const formsList = document.getElementById('project-forms-list');

    // Récupérer les IDs des formulaires déjà dans le projet (et dé-dupliquer)
    let selectedFormIds = [];
    if (project && project.form_order) {
        try {
            const parsed = JSON.parse(project.form_order);
            selectedFormIds = [...new Set(parsed)]; // Dé-dupliquer
        } catch (e) {}
    }

    // Afficher les checkboxes pour tous les formulaires
    formsAvailable.innerHTML = state.forms.map(f => `
        <label class="checkbox-item">
            <input type="checkbox" value="${parseInt(f.id)}" ${selectedFormIds.includes(f.id) ? 'checked' : ''} onchange="updateProjectFormsList()">
            <span>${escapeHtml(f.title)}</span>
        </label>
    `).join('');

    // Afficher la liste ordonnée des formulaires sélectionnés
    updateProjectFormsList(selectedFormIds);

    openModal('modal-project');
}

function updateProjectFormsList(initialOrder = null) {
    const formsList = document.getElementById('project-forms-list');
    const checkboxes = document.querySelectorAll('#project-forms-available input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (selectedIds.length === 0) {
        formsList.innerHTML = '<p style="color: var(--gray-500); font-size: 13px;">Sélectionnez des formulaires ci-dessus</p>';
        return;
    }

    // Récupérer l'ordre actuel de la liste réordonnée (si elle existe)
    const currentItems = formsList.querySelectorAll('.sortable-item');
    const currentOrder = Array.from(currentItems).map(item => parseInt(item.dataset.id));

    // Déterminer l'ordre à utiliser
    let orderedIds = selectedIds;

    // Priorité : ordre initial (édition) > ordre actuel (drag/drop) > ordre des checkboxes
    const baseOrder = initialOrder && Array.isArray(initialOrder) ? initialOrder : currentOrder;

    if (baseOrder.length > 0) {
        // Garder l'ordre existant pour les formulaires déjà présents
        orderedIds = baseOrder.filter(id => selectedIds.includes(id));
        // Ajouter les nouveaux formulaires à la fin
        selectedIds.forEach(id => {
            if (!orderedIds.includes(id)) orderedIds.push(id);
        });
    }

    // Dé-dupliquer les IDs pour éviter les doublons
    const uniqueOrderedIds = [...new Set(orderedIds)];
    const orderedForms = uniqueOrderedIds.map(id => state.forms.find(f => f.id === id)).filter(Boolean);

    formsList.innerHTML = orderedForms.map((form, i) => `
        <div class="sortable-item" draggable="true" data-id="${parseInt(form.id)}">
            <span class="item-number">${i + 1}</span>
            <span class="drag-handle">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                </svg>
            </span>
            <div class="item-info">
                <div class="item-title">${escapeHtml(form.title)}</div>
            </div>
        </div>
    `).join('');

    // Setup drag and drop
    setupSortable(formsList);
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

function getFormOrder() {
    const container = document.getElementById('project-forms-list');
    const items = container.querySelectorAll('.sortable-item');
    return Array.from(items).map(item => parseInt(item.dataset.id));
}

async function saveProject() {
    const name = document.getElementById('project-name-input').value.trim();
    const id = document.getElementById('project-name-input').dataset.id;
    const style = document.querySelector('input[name="project-style"]:checked')?.value || 'google';

    if (!name) {
        alert('Le nom est requis');
        return;
    }

    try {
        const data = { name, style };

        // Ajouter l'ordre des formulaires
        const formOrder = getFormOrder();
        if (formOrder.length > 0) {
            data.form_order = formOrder;
        }

        let projectId = id;

        if (id) {
            await api(`/admin/projects/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            const newProject = await api('/admin/projects', {
                method: 'POST',
                body: JSON.stringify(data)
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
    customConfirm('Supprimer ce projet et tous ses formulaires ?', async () => {
        try {
            await api(`/admin/projects/${id}`, { method: 'DELETE' });
            loadProjects();
            loadForms();
        } catch (error) {
            alert('Erreur: ' + error.message);
        }
    });
}



export { loadProjects };
export { openProjectModal };
export { updateProjectFormsList };
export { setupSortable };
export { updateSortableNumbers };
export { getFormOrder };
export { saveProject };
export { previewLogo };
export { removeLogo };
export { openMediaLibrary };
export { loadMediaLibrary };
export { renderMediaGrid };
export { uploadMedia };
export { deleteMedia };
export { selectMedia };
export { editProject };
export { deleteProject };
