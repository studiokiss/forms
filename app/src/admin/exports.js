import { state } from './state.js';

// ======== EXPORTS ========

// ============ EXPORT PDF ============

async function exportSubmissionPDF(id) {
    try {
        const response = await fetch(`/api/admin/submissions/${id}/pdf`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'export');
        }

        // Récupérer le nom du fichier depuis les headers
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'soumission.pdf';
        if (disposition) {
            const matches = disposition.match(/filename="(.+)"/);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        // Télécharger le fichier
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

async function exportProjectPDF(projectId) {
    try {
        const response = await fetch(`/api/admin/projects/${projectId}/submissions/pdf`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'export');
        }

        // Récupérer le nom du fichier depuis les headers
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'soumissions.pdf';
        if (disposition) {
            const matches = disposition.match(/filename="(.+)"/);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        // Télécharger le fichier
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

async function exportSubmissionJPG(id) {
    try {
        const response = await fetch(`/api/admin/submissions/${id}/jpg`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'export');
        }

        const disposition = response.headers.get('Content-Disposition');
        let filename = 'formulaire.jpg';
        if (disposition) {
            const matches = disposition.match(/filename="(.+)"/);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

async function exportProjectJPG(projectId) {
    try {
        const response = await fetch(`/api/admin/projects/${projectId}/submissions/jpg`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'export');
        }

        const disposition = response.headers.get('Content-Disposition');
        let filename = 'soumissions.zip';
        if (disposition) {
            const matches = disposition.match(/filename="(.+)"/);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}



export { exportSubmissionPDF };
export { exportProjectPDF };
export { exportSubmissionJPG };
export { exportProjectJPG };
