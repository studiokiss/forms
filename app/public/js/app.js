// Security: HTML escape function to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
}

// State
let formData = {};
let formStructure = null;
let submissionId = null;
let wasAlreadySubmitted = false;
let autoSaveTimeout = null;
let isAutoSaving = false;
let pendingAutoSave = false;

// Get slug and prefill from URL: /f/slug or /f/slug/prefillData
const pathParts = window.location.pathname.split('/f/')[1]?.split('/') || [];
const slug = pathParts[0];
const prefillCode = pathParts[1] || null;
const STORAGE_KEY = `kiss_form_${slug}`;

// API Helper
async function api(endpoint, options = {}) {
    const res = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Erreur serveur');
    }

    return data;
}

// Load form
async function loadForm() {
    try {
        const data = await api(`/form/${slug}`);
        formStructure = data.structure;

        document.getElementById('form-title').textContent = formStructure.title;
        document.getElementById('form-description').textContent = formStructure.description || '';

        // Try to load existing submission or draft
        await loadExistingData();

        // Render form
        renderForm();

        // Show form
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('form-view').classList.remove('hidden');

        // Setup auto-save
        setupAutoSave();

    } catch (error) {
        // Rediriger vers une 404 générique (ne révèle rien sur l'application)
        window.location.href = '/404';
    }
}

// Load existing data
async function loadExistingData() {
    const urlParams = new URLSearchParams(window.location.search);

    // Check URL for submission_id
    const urlSubmissionId = urlParams.get('submission_id');

    if (urlSubmissionId) {
        try {
            const submission = await api(`/form/${slug}/submission?submission_id=${urlSubmissionId}`);
            if (submission) {
                submissionId = submission.id;
                formData = submission.data;
                wasAlreadySubmitted = submission.status === 'submitted' || submission.status === 'validated';
                return;
            }
        } catch (e) {
            // No existing submission found
        }
    }

    // Check localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            formData = parsed.data || {};
            submissionId = parsed.submissionId || null;
            wasAlreadySubmitted = parsed.wasAlreadySubmitted || false;
            return; // Données existantes, on ne prérempli pas
        } catch (e) {
            // Invalid stored data, ignore
        }
    }

    // Préremplir avec le code prefill (seulement si pas de données existantes)
    if (prefillCode) {
        try {
            const decoded = JSON.parse(atob(prefillCode));
            formData = decoded;
        } catch (e) {
            // Invalid prefill code, ignore
        }
    }
}

// Render form
function renderForm() {
    const container = document.getElementById('sections-container');
    container.innerHTML = '';

    formStructure.sections.forEach(section => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'section';
        sectionEl.innerHTML = `<h2 class="section-title">${escapeHtml(section.title)}</h2>`;

        section.fields.forEach(field => {
            const fieldEl = createFieldElement(field);
            sectionEl.appendChild(fieldEl);
        });

        container.appendChild(sectionEl);
    });

    // Show warning if already submitted
    if (wasAlreadySubmitted) {
        document.getElementById('submission-warning').classList.remove('hidden');
    }

    // Apply conditional visibility
    updateConditionalFields();
}

// Create field element
function createFieldElement(field) {
    const div = document.createElement('div');
    div.className = 'field';
    div.dataset.fieldId = field.id;

    if (field.condition) {
        div.classList.add('conditional');
        div.dataset.conditionField = field.condition.field;
        div.dataset.conditionValue = field.condition.value;
    }

    const labelClass = field.required ? 'field-label required' : 'field-label';
    const value = formData[field.id];

    let inputHtml = '';

    // Escape field properties for safe HTML insertion
    const safeId = escapeHtml(field.id);
    const safeType = escapeHtml(field.type);
    const safeValue = escapeHtml(value || '');

    switch (field.type) {
        case 'text':
        case 'email':
        case 'tel':
        case 'date':
            inputHtml = `
                <input
                    type="${safeType}"
                    id="${safeId}"
                    name="${safeId}"
                    class="field-input"
                    value="${safeValue}"
                    ${field.required ? 'required' : ''}
                >
            `;
            break;

        case 'textarea':
            inputHtml = `
                <textarea
                    id="${safeId}"
                    name="${safeId}"
                    class="field-textarea"
                    ${field.required ? 'required' : ''}
                >${safeValue}</textarea>
            `;
            break;

        case 'select':
            inputHtml = `
                <select
                    id="${safeId}"
                    name="${safeId}"
                    class="field-select"
                    ${field.required ? 'required' : ''}
                >
                    <option value="">Sélectionnez...</option>
                    ${field.options.map(opt => `
                        <option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>
                    `).join('')}
                </select>
            `;
            break;

        case 'radio':
            inputHtml = `
                <div class="field-options">
                    ${field.options.map(opt => `
                        <div class="option">
                            <input
                                type="radio"
                                id="${safeId}_${escapeHtml(opt)}"
                                name="${safeId}"
                                value="${escapeHtml(opt)}"
                                ${value === opt ? 'checked' : ''}
                                ${field.required ? 'required' : ''}
                            >
                            <label for="${safeId}_${escapeHtml(opt)}">${escapeHtml(opt)}</label>
                        </div>
                    `).join('')}
                </div>
            `;
            break;

        case 'checkbox':
            const checkedValues = Array.isArray(value) ? value : [];
            // Use chips style for fields with more than 6 options
            const useChips = field.options && field.options.length > 6;
            if (useChips) {
                inputHtml = `
                    <div class="field-chips">
                        ${field.options.map(opt => `
                            <div class="chip">
                                <input
                                    type="checkbox"
                                    id="${safeId}_${escapeHtml(opt)}"
                                    name="${safeId}"
                                    value="${escapeHtml(opt)}"
                                    ${checkedValues.includes(opt) ? 'checked' : ''}
                                >
                                <label for="${safeId}_${escapeHtml(opt)}">${escapeHtml(opt)}</label>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                inputHtml = `
                    <div class="field-options">
                        ${field.options.map(opt => `
                            <div class="option">
                                <input
                                    type="checkbox"
                                    id="${safeId}_${escapeHtml(opt)}"
                                    name="${safeId}"
                                    value="${escapeHtml(opt)}"
                                    ${checkedValues.includes(opt) ? 'checked' : ''}
                                >
                                <label for="${safeId}_${escapeHtml(opt)}">${escapeHtml(opt)}</label>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            break;
    }

    div.innerHTML = `
        <label class="${labelClass}" for="${safeId}">${escapeHtml(field.label)}</label>
        ${inputHtml}
    `;

    // Add change listener
    const inputs = div.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            updateFormData();
            updateConditionalFields();
        });
        input.addEventListener('input', () => {
            updateFormData();
            scheduleAutoSave();
        });
    });

    return div;
}

// Update form data from inputs
function updateFormData() {
    formStructure.sections.forEach(section => {
        section.fields.forEach(field => {
            if (field.type === 'checkbox') {
                const checkboxes = document.querySelectorAll(`input[name="${field.id}"]:checked`);
                formData[field.id] = Array.from(checkboxes).map(cb => cb.value);
            } else if (field.type === 'radio') {
                const checked = document.querySelector(`input[name="${field.id}"]:checked`);
                formData[field.id] = checked ? checked.value : '';
            } else {
                const input = document.getElementById(field.id);
                if (input) {
                    formData[field.id] = input.value;
                }
            }
        });
    });
}

// Update conditional fields visibility
function updateConditionalFields() {
    document.querySelectorAll('.field.conditional').forEach(field => {
        const conditionField = field.dataset.conditionField;
        const conditionValue = field.dataset.conditionValue;

        // Find the value of the condition field
        let currentValue = formData[conditionField];

        // For checkboxes, check if the value is in the array
        if (Array.isArray(currentValue)) {
            field.classList.toggle('hidden', !currentValue.includes(conditionValue));
        } else {
            field.classList.toggle('hidden', currentValue !== conditionValue);
        }
    });
}

// Auto-save
function setupAutoSave() {
    document.getElementById('questionnaire-form').addEventListener('change', scheduleAutoSave);
}

function scheduleAutoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(autoSaveToServer, 1500);
}

// Cache local de résilience (hors ligne) — n'affiche aucun message
function saveToLocalStorage() {
    updateFormData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        data: formData,
        submissionId,
        wasAlreadySubmitted,
        savedAt: new Date().toISOString()
    }));
}

// Sauvegarde serveur automatique. Sérialisée : une requête à la fois, pour
// réutiliser le submissionId renvoyé et ne jamais créer de soumission en double.
async function autoSaveToServer() {
    if (isAutoSaving) { pendingAutoSave = true; return; }
    isAutoSaving = true;
    updateFormData();
    try {
        const result = await api(`/form/${slug}/submit`, {
            method: 'POST',
            body: JSON.stringify({ data: formData, submission_id: submissionId, action: 'save' })
        });
        submissionId = result.id;
        saveToLocalStorage();
        showAutoSaveMessage('Brouillon enregistré');
    } catch (error) {
        saveToLocalStorage();
        showAutoSaveMessage('Hors ligne — sauvegardé sur cet appareil');
    } finally {
        isAutoSaving = false;
        if (pendingAutoSave) { pendingAutoSave = false; scheduleAutoSave(); }
    }
}

function showAutoSaveMessage(message) {
    const el = document.getElementById('auto-save-message');
    el.textContent = message;
    el.style.opacity = '1';
    setTimeout(() => {
        el.style.opacity = '0';
    }, 2000);
}

// Save draft to server
async function saveDraft() {
    updateFormData();

    try {
        const result = await api(`/form/${slug}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                data: formData,
                submission_id: submissionId,
                action: 'save'
            })
        });

        submissionId = result.id;
        saveToLocalStorage();
        showAutoSaveMessage('Brouillon sauvegardé sur le serveur');

    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

// Submit form
async function submitForm(e) {
    e.preventDefault();
    updateFormData();

    // Validate required fields
    const form = document.getElementById('questionnaire-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Confirm if already submitted
    if (wasAlreadySubmitted) {
        if (!confirm('Ce formulaire a déjà été soumis. Voulez-vous vraiment envoyer vos modifications ?')) {
            return;
        }
    }

    try {
        const result = await api(`/form/${slug}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                data: formData,
                submission_id: submissionId,
                action: 'submit'
            })
        });

        // Update state
        submissionId = result.id;
        wasAlreadySubmitted = true;

        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            data: formData,
            submissionId,
            wasAlreadySubmitted,
            savedAt: new Date().toISOString()
        }));

        // Show success
        document.getElementById('form-view').classList.add('hidden');
        document.getElementById('success-message').textContent = result.message;
        document.getElementById('success-view').classList.remove('hidden');

    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

// Event listeners
document.getElementById('save-draft-btn').addEventListener('click', saveDraft);
document.getElementById('questionnaire-form').addEventListener('submit', submitForm);

// Init
loadForm();
