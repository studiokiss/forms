import { state } from './state.js';
import { escapeHtml, formatDate, getStatusLabel } from './utils.js';
import { api } from './api.js';
import { handleRoute } from './router.js';
import { loadBackups } from './backups.js';
import { loadProjects } from './projects.js';
import { loadForms, editForm } from './forms.js';
import { loadSubmissions } from './submissions.js';
import { viewProjectSubmissions } from './submissions.js';
import { editProject } from './projects.js';
import { viewSubmission } from './submissions.js';
import { navigateTo } from './router.js';

// ======== DASHBOARD ========
// Views
function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');

    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.view === viewName);
    });

    // Load data
    switch (viewName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'forms':
            loadForms();
            break;
        case 'submissions':
            loadSubmissions();
            break;
        case 'backups':
            loadBackups();
            break;
    }
}

async function showAdminView() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');

    // Load state.templates and state.forms for routing
    state.templates = await api('/admin/templates');
    state.forms = await api('/admin/forms');
    state.projects = await api('/admin/projects');

    // Router vers la page actuelle (ou dashboard par défaut)
    await handleRoute();
}

// Dashboard
async function loadDashboard() {
    // Charger toutes les données en parallèle
    const [stats, allProjects, allForms] = await Promise.all([
        api('/admin/stats'),
        api('/admin/projects'),
        api('/admin/forms')
    ]);

    // Stats cliquables
    const statsGridEl = document.getElementById('stats-grid');
    if (statsGridEl) {
        statsGridEl.innerHTML = `
            <div class="stat-card stat-card-link" onclick="navigateTo('projects')">
                <div class="stat-value">${parseInt(stats.projects) || 0}</div>
                <div class="stat-label">Projets</div>
            </div>
            <div class="stat-card stat-card-link" onclick="navigateTo('forms')">
                <div class="stat-value">${parseInt(stats.forms) || 0}</div>
                <div class="stat-label">Formulaires</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${parseInt(stats.submissions) || 0}</div>
                <div class="stat-label">Soumissions</div>
            </div>
        `;
    }

    // Section projets avec accès direct aux soumissions
    let projectsHtml = '';
    if (allProjects.length === 0) {
        projectsHtml = '<p class="text-muted">Aucun projet</p>';
    } else {
        projectsHtml = `
            <div class="dashboard-list">
                ${allProjects.map(p => {
                    const formsCount = parseInt(p.forms_count) || 0;
                    return `
                        <div class="dashboard-item">
                            <div class="dashboard-item-info">
                                <span class="dashboard-item-name">${escapeHtml(p.name)}</span>
                                <span class="dashboard-item-meta">${parseInt(formsCount)} formulaire(s)</span>
                            </div>
                            <div class="dashboard-item-actions">
                                <button class="btn btn-xs btn-ghost" onclick="viewProjectSubmissions(${parseInt(p.id)})" title="Soumissions">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </button>
                                <button class="btn btn-xs btn-ghost" onclick="editProject(${parseInt(p.id)})" title="Modifier">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    const dashboardProjectsEl = document.getElementById('dashboard-projects');
    if (dashboardProjectsEl) dashboardProjectsEl.innerHTML = projectsHtml;

    // Section formulaires avec accès direct à l'éditeur
    let formsHtml = '';
    if (allForms.length === 0) {
        formsHtml = '<p class="text-muted">Aucun formulaire</p>';
    } else {
        formsHtml = `
            <div class="dashboard-list">
                ${allForms.slice(0, 6).map(f => {
                    const structure = f.structure ? JSON.parse(f.structure) : { sections: [] };
                    const fieldsCount = structure.sections?.reduce((acc, s) => acc + (s.fields?.length || 0), 0) || 0;
                    return `
                        <div class="dashboard-item">
                            <div class="dashboard-item-info">
                                <span class="dashboard-item-name">${escapeHtml(f.title)}</span>
                                <span class="dashboard-item-meta">${parseInt(fieldsCount)} champ(s)</span>
                            </div>
                            <div class="dashboard-item-actions">
                                <button class="btn btn-xs btn-ghost" onclick="editForm(${parseInt(f.id)})" title="Éditer">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                ${f.slug ? `
                                    <a href="/f/${encodeURIComponent(f.slug)}" target="_blank" class="btn btn-xs btn-ghost" title="Prévisualiser">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${allForms.length > 6 ? `<a href="#forms" class="dashboard-more" onclick="navigateTo('forms')">Voir tous les formulaires →</a>` : ''}
        `;
    }

    const dashboardFormsEl = document.getElementById('dashboard-forms');
    if (dashboardFormsEl) dashboardFormsEl.innerHTML = formsHtml;

    // Soumissions récentes
    let recentSubmissions = [];
    for (const form of allForms.slice(0, 5)) {
        try {
            const formId = parseInt(form.id);
            if (isNaN(formId) || formId <= 0) continue;
            const subs = await api(`/admin/forms/${formId}/submissions`);
            if (Array.isArray(subs)) {
                recentSubmissions = recentSubmissions.concat(
                    subs.slice(0, 3).map(s => ({ ...s, form_title: form.title }))
                );
            }
        } catch (e) {}
    }

    recentSubmissions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    const recentSubsEl = document.getElementById('recent-submissions');
    if (!recentSubsEl) return;

    if (recentSubmissions.length === 0) {
        recentSubsEl.innerHTML = '<p class="text-muted">Aucune soumission récente</p>';
    } else {
        recentSubsEl.innerHTML = `
            <div class="dashboard-list">
                ${recentSubmissions.slice(0, 5).map(s => `
                    <div class="dashboard-item">
                        <div class="dashboard-item-info">
                            <span class="dashboard-item-name">${escapeHtml(s.form_title)}</span>
                            <span class="dashboard-item-meta">
                                <span class="badge badge-${escapeHtml(s.status)} badge-sm">${escapeHtml(getStatusLabel(s.status))}</span>
                                ${escapeHtml(formatDate(s.updated_at))}
                            </span>
                        </div>
                        <div class="dashboard-item-actions">
                            <button class="btn btn-xs btn-ghost" onclick="viewSubmission(${parseInt(s.id)})" title="Voir">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}


export { showView };
export { showAdminView };
export { loadDashboard };
