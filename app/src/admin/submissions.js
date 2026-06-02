import { state } from './state.js';
import { escapeHtml, formatDate, getStatusLabel, customConfirm } from './utils.js';
import { api } from './api.js';
import { navigateTo } from './router.js';
import { showView } from './dashboard.js';
import { exportSubmissionJPG, exportProjectJPG } from './exports.js';

// ======== SUBMISSIONS ========
// Submissions

async function viewProjectSubmissions(projectId, updateHash = true) {
    state.currentProjectId = projectId;
    const project = state.projects.find(p => p.id === projectId);
    document.getElementById('submissions-title').textContent = `Soumissions - ${project?.name || 'Projet'}`;

    // Réinitialiser le filtre au statut par défaut
    state.currentSubmissionFilter = 'submitted';
    const filterSelect = document.getElementById('submissions-status-filter');
    if (filterSelect) filterSelect.value = state.currentSubmissionFilter;

    await loadSubmissions();
    showView('submissions');

    if (updateHash) {
        navigateTo('project', { id: projectId });
    }
}

function filterSubmissions() {
    const filterSelect = document.getElementById('submissions-status-filter');
    state.currentSubmissionFilter = filterSelect.value;
    loadSubmissions();
}

function goBackToSubmissions() {
    if (state.currentProjectId) {
        navigateTo('project', { id: state.currentProjectId });
    } else {
        navigateTo('projects');
    }
}

async function loadSubmissions() {
    if (!state.currentProjectId) {
        document.getElementById('submissions-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Sélectionnez un projet</div>
                <p>Accédez aux soumissions depuis la liste des projets.</p>
            </div>
        `;
        return;
    }

    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) {
        document.getElementById('submissions-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Projet introuvable</div>
                <p>Ce projet n'existe plus ou a été supprimé.</p>
            </div>
        `;
        return;
    }

    // Instances du projet (source de vérité : project_id + position)
    const instances = await api(`/admin/forms?project_id=${state.currentProjectId}`);

    if (!Array.isArray(instances) || instances.length === 0) {
        document.getElementById('submissions-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucun formulaire</div>
                <p>Ce projet n'a pas encore de formulaires associés.</p>
            </div>
        `;
        return;
    }

    // Charger les soumissions groupées par formulaire (instance)
    state.projectSubmissionsData = [];
    for (const form of instances) {
        try {
            const subs = await api(`/admin/forms/${form.id}/submissions`);
            if (!Array.isArray(subs)) continue;

            const sortedSubs = subs
                .map(s => ({ ...s, form_title: form.title, form_id: form.id }))
                .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

            state.projectSubmissionsData.push({
                formId: form.id,
                formTitle: form.title,
                formSlug: form.slug,
                submissions: sortedSubs
            });
        } catch (e) {
            console.error(`Erreur chargement soumissions form ${form.id}:`, e);
        }
    }

    // Filtrer les soumissions par statut si nécessaire
    const filteredData = state.projectSubmissionsData.map(formData => {
        let filtered = formData.submissions;
        if (state.currentSubmissionFilter && state.currentSubmissionFilter !== 'all') {
            filtered = formData.submissions.filter(s => s.status === state.currentSubmissionFilter);
        }
        return { ...formData, filteredSubmissions: filtered };
    });

    // Vérifier s'il y a des soumissions
    const totalSubmissions = filteredData.reduce((sum, f) => sum + f.filteredSubmissions.length, 0);

    if (totalSubmissions === 0) {
        const filterLabel = state.currentSubmissionFilter === 'all' ? '' : ` avec le statut "${escapeHtml(getStatusLabel(state.currentSubmissionFilter))}"`;
        document.getElementById('submissions-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucune soumission${filterLabel}</div>
                <p>Les soumissions de ce projet apparaîtront ici.</p>
            </div>
        `;
        return;
    }

    // Afficher la vue groupée par formulaire
    document.getElementById('submissions-list').innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <span style="color: var(--gray-600);">${instances.length} formulaire(s), ${totalSubmissions} soumission(s)</span>
            <button class="btn btn-primary" onclick="exportProjectJPG(${parseInt(state.currentProjectId)})">
                Exporter tout (ZIP)
            </button>
        </div>
        <div class="submissions-grouped">
            ${filteredData.map(formData => {
                const subs = formData.filteredSubmissions;
                if (subs.length === 0) {
                    // Formulaire sans soumission pour ce filtre - afficher quand même
                    return `
                        <div class="form-submissions-group">
                            <div class="form-group-header">
                                <div class="form-group-title">
                                    <strong>${escapeHtml(formData.formTitle)}</strong>
                                    <span class="form-group-count">Aucune soumission</span>
                                </div>
                            </div>
                        </div>
                    `;
                }

                const latest = subs[0];
                const hasMultipleVersions = subs.length > 1;

                return `
                    <div class="form-submissions-group">
                        <div class="form-group-row">
                            <div class="form-group-left">
                                <strong class="form-group-title">${escapeHtml(formData.formTitle)}</strong>
                                <span class="badge badge-${escapeHtml(latest.status)}">${escapeHtml(getStatusLabel(latest.status))}</span>
                                <span class="form-group-date">${escapeHtml(formatDate(latest.updated_at))}</span>
                                ${hasMultipleVersions ? `<button class="versions-toggle" onclick="toggleVersions(this)">${subs.length} versions</button>` : ''}
                            </div>
                            <div class="form-group-actions">
                                <button class="btn btn-sm btn-secondary" onclick="viewSubmission(${parseInt(latest.id)})">Voir</button>
                                <button class="btn btn-sm btn-secondary" onclick="exportSubmissionJPG(${parseInt(latest.id)})">JPG</button>
                                <button class="btn btn-sm btn-secondary" onclick="changeSubmissionStatus(${parseInt(latest.id)}, '${escapeHtml(latest.status)}')">Statut</button>
                            </div>
                        </div>
                        ${hasMultipleVersions ? `
                            <div class="versions-panel" style="display: none;">
                                ${subs.map((s, idx) => `
                                    <div class="version-row ${idx === 0 ? 'version-current' : ''}">
                                        <span class="version-number">${idx === 0 ? 'Actuelle' : 'v' + (subs.length - idx)}</span>
                                        <span class="badge badge-${escapeHtml(s.status)}">${escapeHtml(getStatusLabel(s.status))}</span>
                                        <span class="version-date">${escapeHtml(formatDate(s.updated_at))}</span>
                                        <div class="version-row-actions">
                                            <button class="btn btn-xs btn-ghost" onclick="viewSubmission(${parseInt(s.id)})">Voir</button>
                                            <button class="btn btn-xs btn-ghost" onclick="exportSubmissionJPG(${parseInt(s.id)})">JPG</button>
                                            ${idx > 0 ? `<button class="btn btn-xs btn-ghost-danger" onclick="deleteSubmission(${parseInt(s.id)})">×</button>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function toggleVersions(btn) {
    const group = btn.closest('.form-submissions-group');
    if (!group) return;
    const panel = group.querySelector('.versions-panel');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.classList.toggle('active', isHidden);
}

async function viewSubmission(id, updateHash = true) {
    const submission = await api(`/admin/submissions/${id}`);
    const data = JSON.parse(submission.data);
    const structure = JSON.parse(submission.form_structure);

    if (updateHash) {
        navigateTo('submission', { id: id });
    }

    let html = `
        <div class="message message-${submission.status === 'submitted' ? 'warning' : submission.status === 'validated' ? 'success' : 'info'}" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Statut: <strong>${escapeHtml(getStatusLabel(submission.status))}</strong> | Dernière mise à jour: ${escapeHtml(formatDate(submission.updated_at))}</span>
            <button class="btn btn-primary" onclick="exportSubmissionJPG(${parseInt(submission.id)})">
                Exporter JPG
            </button>
        </div>
        <h3 style="margin-bottom: 20px;">${escapeHtml(submission.form_title)}</h3>
    `;

    structure.sections.forEach(section => {
        html += `<h4 style="margin: 20px 0 15px; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(section.title)}</h4>`;

        section.fields.forEach(field => {
            const value = data[field.id];
            let displayValue = '-';

            if (value !== undefined && value !== null && value !== '') {
                if (Array.isArray(value)) {
                    displayValue = value.join(', ');
                } else {
                    displayValue = value;
                }
            }

            html += `
                <div style="margin-bottom: 15px; padding: 10px; background: var(--gray-100); border-radius: 4px;">
                    <div style="font-weight: 500; margin-bottom: 5px;">${escapeHtml(field.label)}</div>
                    <div>${escapeHtml(displayValue)}</div>
                </div>
            `;
        });
    });

    document.getElementById('submission-detail-content').innerHTML = html;
    showView('submission-detail');
}

async function changeSubmissionStatus(id, currentStatus) {
    const statuses = ['draft', 'submitted', 'validated', 'archived'];
    const nextStatus = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];

    if (window.confirm(`Changer le statut en "${getStatusLabel(nextStatus)}" ?`)) {
        await api(`/admin/submissions/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: nextStatus })
        });
        loadSubmissions();
    }
}

async function deleteSubmission(id) {
    customConfirm('Supprimer cette soumission ?', async () => {
        await api(`/admin/submissions/${id}`, { method: 'DELETE' });
        loadSubmissions();
    });
}


export { viewProjectSubmissions };
export { filterSubmissions };
export { goBackToSubmissions };
export { loadSubmissions };
export { toggleVersions };
export { viewSubmission };
export { changeSubmissionStatus };
export { deleteSubmission };
