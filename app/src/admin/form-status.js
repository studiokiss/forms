import { state } from './state.js';
import { api } from './api.js';

// ======== FORM-STATUS ========


async function saveForm(status = null) {
    const title = document.getElementById('form-title-input').value.trim();

    if (!title) {
        alert('Le titre est requis');
        return;
    }

    state.currentFormStructure.title = title;

    // Utiliser le statut passé ou garder l'actuel
    const newStatus = status || state.currentFormStatus;

    try {
        const updatedForm = await api(`/admin/forms/${state.currentFormId}`, {
            method: 'PUT',
            body: JSON.stringify({
                title,
                structure: state.currentFormStructure,
                status: newStatus
            })
        });

        // Mettre à jour le statut local et le cache
        state.currentFormStatus = updatedForm.status;
        const formIndex = state.forms.findIndex(f => f.id === state.currentFormId);
        if (formIndex !== -1) {
            state.forms[formIndex] = updatedForm;
        }

        updateFormStatusBadge();
        updateClientLinkButton();

        const statusLabel = newStatus === 'active' ? 'publié' : 'enregistré en brouillon';
        alert(`Formulaire ${statusLabel} !`);
    } catch (error) {
        alert(error.message);
    }
}

function updateFormStatusBadge() {
    const badge = document.getElementById('form-status-badge');
    if (!badge) return;

    if (state.currentFormStatus === 'active') {
        badge.className = 'badge badge-validated';
        badge.textContent = 'Publié';
    } else {
        badge.className = 'badge badge-draft';
        badge.textContent = 'Brouillon';
    }
}

function updateClientLinkButton() {
    const btn = document.getElementById('btn-client-link');
    if (!btn) return;

    if (state.currentFormStatus === 'active') {
        btn.disabled = false;
        btn.title = 'Voir la version enregistrée (lien client)';
    } else {
        btn.disabled = true;
        btn.title = 'Le formulaire doit être publié pour être accessible';
    }
}

function previewForm() {
    // Prévisualisation en temps réel sans enregistrer
    // Stocker la structure actuelle dans sessionStorage
    sessionStorage.setItem('kiss_form_preview', JSON.stringify(state.currentFormStructure));
    window.open('/preview.html', '_blank');
}

function previewSavedForm() {
    // Prévisualisation de la version enregistrée
    const form = state.forms.find(f => f.id === state.currentFormId);

    if (!form || !form.slug) {
        alert('Le formulaire doit être enregistré au moins une fois pour avoir un lien.');
        return;
    }

    if (form.status !== 'active') {
        alert('Le formulaire est en brouillon. Publiez-le pour le rendre accessible.');
        return;
    }

    window.open(`/f/${form.slug}`, '_blank');
}



export { saveForm };
export { updateFormStatusBadge };
export { updateClientLinkButton };
export { previewForm };
export { previewSavedForm };
