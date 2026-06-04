// Point d'entrée — Kiss Forms Admin
import { escapeHtml, formatDate, getStatusLabel, openModal, closeModal, customConfirm } from './utils.js';
import { navigateTo, handleRoute } from './router.js';
import { api, login, logout, downloadBackup, checkSession } from './api.js';
import { loadBackups, createBackup, downloadBackupFile, deleteBackup } from './backups.js';
import { showView, showAdminView, loadDashboard } from './dashboard.js';
import { loadProjects, openProjectModal, toggleProjectForm, removeProjectFormItem, editProjectInstance, saveProject, previewLogo, removeLogo, testProjectWebhook, openMediaLibrary, uploadMedia, deleteMedia, selectMedia, editProject, deleteProject } from './projects.js';
import { loadForms, openFormModal, createForm, editForm, duplicateForm, deleteForm } from './forms.js';
import { renderEditor, addSection, editSection, saveSection, deleteSection, addField, editField, saveField, deleteField, toggleFieldOptions, toggleConditionValue } from './editor.js';
import { saveForm, updateFormStatusBadge, updateClientLinkButton, previewForm, previewSavedForm } from './form-status.js';
import { viewProjectSubmissions, filterSubmissions, goBackToSubmissions, loadSubmissions, toggleVersions, viewSubmission, changeSubmissionStatus, deleteSubmission } from './submissions.js';
import { exportSubmissionPDF, exportProjectPDF, exportSubmissionJPG, exportProjectJPG } from './exports.js';

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('login-form').addEventListener('submit', login);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.addEventListener('click', (e) => { e.preventDefault(); navigateTo(a.dataset.view); });
    });
    if (await checkSession()) showAdminView();
});

Object.assign(window, {
    navigateTo, login, logout, downloadBackup,
    loadBackups, createBackup, downloadBackupFile, deleteBackup,
    showView, showAdminView, loadDashboard,
    loadProjects, openProjectModal, toggleProjectForm, removeProjectFormItem, editProjectInstance, saveProject,
    previewLogo, removeLogo, testProjectWebhook, openMediaLibrary, uploadMedia, deleteMedia, selectMedia,
    editProject, deleteProject,
    loadForms, openFormModal, createForm, editForm, duplicateForm, deleteForm,
    renderEditor, addSection, editSection, saveSection, deleteSection,
    addField, editField, saveField, deleteField, toggleFieldOptions, toggleConditionValue,
    saveForm, updateFormStatusBadge, previewForm, previewSavedForm,
    viewProjectSubmissions, filterSubmissions, goBackToSubmissions, loadSubmissions,
    toggleVersions, viewSubmission, changeSubmissionStatus, deleteSubmission,
    exportSubmissionPDF, exportProjectPDF, exportSubmissionJPG, exportProjectJPG,
    openModal, closeModal, customConfirm, formatDate, getStatusLabel, escapeHtml,
});
