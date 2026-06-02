import { state } from './state.js';
import { showAdminView } from './dashboard.js';

// ======== API ========
async function api(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {})
    };

    try {
        const res = await fetch(`/api${endpoint}`, {
            ...options,
            headers: { ...headers, ...options.headers }
        });

        const data = await res.json();

        if (!res.ok) {
            if (res.status === 401) {
                logout();
            }
            throw new Error(data.error || 'Erreur serveur');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth
async function login(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const data = await api('/admin/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });

        state.token = data.token;
        localStorage.setItem('kiss_admin_token', state.token);
        errorEl.classList.add('hidden');
        showAdminView();
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

function logout() {
    state.token = null;
    localStorage.removeItem('kiss_admin_token');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('password').value = '';
}

// Backup de la base de données
async function downloadBackup() {
    const btn = document.getElementById('backup-btn');
    const originalHTML = btn.innerHTML;

    // Icones SVG pour les différents états
    const iconLoading = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
    const iconSuccess = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const iconError = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    try {
        // Feedback visuel - loading
        btn.style.pointerEvents = 'none';
        btn.innerHTML = `${iconLoading}<span class="nav-tool-text">Chargement...</span>`;

        const response = await fetch('/api/admin/backup', {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur de téléchargement');
        }

        // Créer un blob et déclencher le téléchargement
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Extraire le nom du fichier du header Content-Disposition
        const disposition = response.headers.get('Content-Disposition');
        const filenameMatch = disposition && disposition.match(/filename="(.+)"/);
        a.download = filenameMatch ? filenameMatch[1] : 'kiss-forms-backup.db';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Feedback succès
        btn.innerHTML = `${iconSuccess}<span class="nav-tool-text">Backup OK!</span>`;

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.pointerEvents = '';
        }, 2000);

    } catch (error) {
        console.error('Erreur backup:', error);
        btn.innerHTML = `${iconError}<span class="nav-tool-text">Erreur</span>`;
        alert(error.message);

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.pointerEvents = '';
        }, 2000);
    }
}

async function checkSession() {
    if (!state.token) return false;

    try {
        await api('/admin/check-session');
        return true;
    } catch {
        return false;
    }
}


export { api };
export { login };
export { logout };
export { downloadBackup };
export { checkSession };
