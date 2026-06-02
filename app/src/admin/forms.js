import { state } from './state.js';
import { escapeHtml, openModal, closeModal, customConfirm } from './utils.js';
import { api } from './api.js';
import { renderEditor } from './editor.js';
import { updateFormStatusBadge, updateClientLinkButton } from './form-status.js';
import { showView } from './dashboard.js';
import { navigateTo } from './router.js';

// ======== FORMS ========
// Forms
async function loadForms() {
    state.forms = await api('/admin/forms');

    // Update template select
    document.getElementById('new-form-template').innerHTML = `
        <option value="">Formulaire vide</option>
        ${state.templates.map(t => `<option value="${parseInt(t.id)}">${escapeHtml(t.name)}</option>`).join('')}
    `;

    if (state.forms.length === 0) {
        document.getElementById('forms-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucun formulaire</div>
                <p>Créez votre premier formulaire.</p>
            </div>
        `;
    } else {
        document.getElementById('forms-list').innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Titre</th>
                        <th>Statut</th>
                        <th>Sections</th>
                        <th>Champs</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.forms.map(f => {
                        const structure = f.structure ? JSON.parse(f.structure) : { sections: [] };
                        const sectionsCount = structure.sections?.length || 0;
                        const fieldsCount = structure.sections?.reduce((acc, s) => acc + (s.fields?.length || 0), 0) || 0;
                        const statusBadge = f.status === 'active'
                            ? '<span class="badge badge-validated">Publié</span>'
                            : '<span class="badge badge-draft">Brouillon</span>';
                        return `
                        <tr>
                            <td><strong>${escapeHtml(f.title)}</strong></td>
                            <td>${statusBadge}</td>
                            <td>${parseInt(sectionsCount)}</td>
                            <td>${parseInt(fieldsCount)}</td>
                            <td class="table-actions">
                                <button class="btn btn-sm btn-secondary" onclick="editForm(${parseInt(f.id)})">Modifier</button>
                                <button class="btn btn-sm btn-secondary" onclick="duplicateForm(${parseInt(f.id)})">Dupliquer</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteForm(${parseInt(f.id)})">Supprimer</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
    }
}

function openFormModal() {
    document.getElementById('new-form-title').value = '';
    document.getElementById('new-form-template').value = '';
    openModal('modal-form');
}

async function createForm() {
    const title = document.getElementById('new-form-title').value.trim();
    const template_id = document.getElementById('new-form-template').value || null;

    if (!title) {
        alert('Le titre est requis');
        return;
    }

    try {
        const form = await api('/admin/forms', {
            method: 'POST',
            body: JSON.stringify({ title, template_id })
        });

        closeModal('modal-form');
        editForm(form.id);
    } catch (error) {
        alert(error.message);
    }
}

async function editForm(id, updateHash = true) {
    const form = await api(`/admin/forms/${id}`);
    state.currentFormId = id;
    state.currentFormStructure = JSON.parse(form.structure);
    state.currentFormStatus = form.status || 'draft';

    document.getElementById('editor-title').textContent = 'Modifier: ' + escapeHtml(form.title);
    document.getElementById('form-title-input').value = state.currentFormStructure.title || form.title;

    // Mettre à jour le badge et le bouton lien client
    updateFormStatusBadge();
    updateClientLinkButton();

    renderEditor();
    showView('form-editor');

    if (updateHash) {
        navigateTo('form', { id: id });
    }
}

async function duplicateForm(id) {
    const title = prompt('Titre du nouveau formulaire:');
    if (!title) return;

    try {
        const form = await api(`/admin/forms/${id}/duplicate`, {
            method: 'POST',
            body: JSON.stringify({ title })
        });

        loadForms();
        editForm(form.id);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteForm(id) {
    customConfirm('Supprimer ce formulaire et toutes ses soumissions ?', async () => {
        await api(`/admin/forms/${id}`, { method: 'DELETE' });
        loadForms();
    });
}


export { loadForms };
export { openFormModal };
export { createForm };
export { editForm };
export { duplicateForm };
export { deleteForm };
