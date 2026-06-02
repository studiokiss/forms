(() => {
  // src/admin/utils.js
  function escapeHtml(text) {
    if (text === null || text === void 0) return "";
    const str = String(text);
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return str.replace(/[&<>"']/g, (m) => map[m]);
  }
  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function getStatusLabel(status) {
    return { draft: "Brouillon", submitted: "Soumis", validated: "Valid\xE9", archived: "Archiv\xE9", active: "Actif", inactive: "Inactif" }[status] || status;
  }
  function getFieldTypeLabel(type) {
    return { text: "Texte court", email: "Email", tel: "T\xE9l\xE9phone", textarea: "Texte long", date: "Date", select: "Liste d\xE9roulante", radio: "Choix unique", checkbox: "Choix multiples" }[type] || type;
  }
  function generateId(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").substring(0, 50);
  }
  function openModal(id) {
    document.getElementById(id).classList.add("active");
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove("active");
  }
  function customConfirm(message, callback) {
    document.getElementById("confirm-message").textContent = message;
    document.getElementById("confirm-btn").onclick = () => {
      closeModal("modal-confirm");
      if (typeof callback === "function") callback();
    };
    openModal("modal-confirm");
  }

  // src/admin/state.js
  var state = {
    token: localStorage.getItem("kiss_admin_token"),
    currentFormId: null,
    currentFormStructure: { title: "", description: "Studio Kiss", sections: [] },
    editingFieldIndex: null,
    editingSectionIndex: null,
    projects: [],
    forms: [],
    templates: [],
    currentSubmissionFilter: "submitted",
    currentProjectLogo: null,
    pendingLogoFile: null,
    mediaLibrary: [],
    currentFormStatus: "draft",
    currentProjectId: null,
    projectSubmissionsData: [],
    draggedSection: null,
    draggedField: null
  };

  // src/admin/backups.js
  async function loadBackups() {
    const container = document.getElementById("backups-list");
    container.innerHTML = '<p class="text-muted">Chargement...</p>';
    try {
      const backups = await api("/admin/backups");
      if (backups.length === 0) {
        container.innerHTML = `
                <div class="empty-state">
                    <p>Aucun backup disponible</p>
                    <p style="font-size: 13px; color: var(--gray-500);">Cliquez sur "Nouveau backup" pour cr\xE9er une sauvegarde</p>
                </div>
            `;
        return;
      }
      container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Fichier</th>
                        <th>Date</th>
                        <th>Taille</th>
                        <th style="width: 120px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${backups.map((backup) => `
                        <tr>
                            <td>
                                <span style="font-family: monospace; font-size: 13px;">${escapeHtml(backup.filename)}</span>
                                ${backup.filename.includes("-scheduled-") ? '<span class="badge badge-sm" style="margin-left: 8px; background: var(--accent-light); color: var(--accent);">Auto</span>' : ""}
                                ${backup.filename.includes("-manual-") ? '<span class="badge badge-sm" style="margin-left: 8px; background: var(--gray-200); color: var(--gray-600);">Manuel</span>' : ""}
                            </td>
                            <td>${formatDate(backup.date)}</td>
                            <td>${backup.sizeFormatted}</td>
                            <td class="table-actions">
                                <button class="btn btn-sm btn-secondary" onclick="downloadBackupFile('${escapeHtml(backup.filename)}')" title="T\xE9l\xE9charger">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteBackup('${escapeHtml(backup.filename)}')" title="Supprimer">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    } catch (error) {
      container.innerHTML = `<p class="text-muted" style="color: var(--danger);">Erreur: ${error.message}</p>`;
    }
  }
  async function createBackup(e) {
    const btn = e ? e.target.closest("button") : document.querySelector("#view-backups .btn-primary");
    const originalHTML = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" style="margin-right: 6px;">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Cr\xE9ation...
        `;
      const result = await api("/admin/backups", { method: "POST" });
      if (result.success) {
        await loadBackups();
      }
    } catch (error) {
      alert("Erreur: " + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
  async function downloadBackupFile(filename) {
    try {
      const response = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}`, {
        headers: { "Authorization": `Bearer ${state.token}` }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur de t\xE9l\xE9chargement");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Erreur: " + error.message);
    }
  }
  async function deleteBackup(filename) {
    if (!window.confirm(`Supprimer le backup "${filename}" ?`)) return;
    try {
      await api(`/admin/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
      await loadBackups();
    } catch (error) {
      alert("Erreur: " + error.message);
    }
  }

  // src/admin/editor.js
  function renderEditor() {
    const container = document.getElementById("editor-sections");
    if (state.currentFormStructure.sections.length === 0) {
      container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucune section</div>
                <p>Ajoutez une section pour commencer \xE0 construire votre formulaire.</p>
            </div>
        `;
      return;
    }
    container.innerHTML = state.currentFormStructure.sections.map((section, sIdx) => `
        <div class="editor-section" data-section="${sIdx}" draggable="true">
            <div class="editor-section-header">
                <span class="drag-handle section-handle" title="Glisser pour r\xE9ordonner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                    </svg>
                </span>
                <span class="editor-section-title">${escapeHtml(section.title)}</span>
                <div class="table-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editSection(${sIdx})">Modifier</button>
                    <button class="btn btn-sm btn-secondary" onclick="addField(${sIdx})">+ Champ</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSection(${sIdx})">Supprimer</button>
                </div>
            </div>
            <div class="editor-section-body editor-fields-container" data-section="${sIdx}">
                ${section.fields.length === 0 ? '<p class="empty-fields-msg" style="color: var(--gray-500);">Aucun champ. Cliquez sur "+ Champ" pour en ajouter.</p>' : ""}
                ${section.fields.map((field, fIdx) => `
                    <div class="editor-field ${field.condition ? "conditional" : ""}" data-field="${fIdx}" data-section="${sIdx}" draggable="true">
                        <span class="drag-handle field-handle" title="Glisser pour r\xE9ordonner">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                            </svg>
                        </span>
                        <div class="editor-field-info">
                            <div class="editor-field-label">${escapeHtml(field.label)}</div>
                            <div class="editor-field-type">${escapeHtml(getFieldTypeLabel(field.type))}${field.required ? " \u2022 Obligatoire" : ""}${field.condition ? " \u2022 Conditionnel" : ""}</div>
                        </div>
                        <div class="editor-field-actions">
                            <button class="btn btn-sm btn-secondary" onclick="editField(${sIdx}, ${fIdx})">Modifier</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteField(${sIdx}, ${fIdx})">Supprimer</button>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>
    `).join("");
    setupEditorDragDrop();
  }
  function setupEditorDragDrop() {
    const container = document.getElementById("editor-sections");
    if (!container) return;
    const sections = container.querySelectorAll(".editor-section");
    sections.forEach((section) => {
      section.addEventListener("dragstart", handleSectionDragStart);
      section.addEventListener("dragend", handleSectionDragEnd);
      section.addEventListener("dragover", handleSectionDragOver);
      section.addEventListener("drop", handleSectionDrop);
    });
    const fields = container.querySelectorAll(".editor-field");
    fields.forEach((field) => {
      field.addEventListener("dragstart", handleFieldDragStart);
      field.addEventListener("dragend", handleFieldDragEnd);
    });
    const fieldContainers = container.querySelectorAll(".editor-fields-container");
    fieldContainers.forEach((fc) => {
      fc.addEventListener("dragover", handleFieldDragOver);
      fc.addEventListener("drop", handleFieldDrop);
      fc.addEventListener("dragleave", handleFieldDragLeave);
    });
  }
  function handleSectionDragStart(e) {
    if (e.target.classList.contains("editor-field")) {
      return;
    }
    state.draggedSection = this;
    state.draggedField = null;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "section");
    setTimeout(() => this.classList.add("dragging"), 0);
  }
  function handleSectionDragEnd(e) {
    this.classList.remove("dragging");
    document.querySelectorAll(".editor-section").forEach((s) => s.classList.remove("drag-over"));
    if (state.draggedSection) {
      applyNewSectionOrder();
    }
    state.draggedSection = null;
  }
  function handleSectionDragOver(e) {
    if (!state.draggedSection || state.draggedField) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const section = this;
    if (section === state.draggedSection) return;
    const rect = section.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const container = document.getElementById("editor-sections");
    document.querySelectorAll(".editor-section").forEach((s) => s.classList.remove("drag-over"));
    section.classList.add("drag-over");
    if (e.clientY < midY) {
      container.insertBefore(state.draggedSection, section);
    } else {
      container.insertBefore(state.draggedSection, section.nextSibling);
    }
  }
  function handleSectionDrop(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  function applyNewSectionOrder() {
    const container = document.getElementById("editor-sections");
    if (!container) return;
    const sectionElements = container.querySelectorAll(".editor-section");
    const newSections = [];
    sectionElements.forEach((el) => {
      const oldIdx = parseInt(el.dataset.section);
      if (!isNaN(oldIdx) && state.currentFormStructure.sections[oldIdx]) {
        newSections.push(state.currentFormStructure.sections[oldIdx]);
      }
    });
    if (newSections.length === state.currentFormStructure.sections.length) {
      state.currentFormStructure.sections = newSections;
      renderEditor();
    }
  }
  function handleFieldDragStart(e) {
    e.stopPropagation();
    state.draggedField = this;
    state.draggedSection = null;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "field");
    setTimeout(() => this.classList.add("dragging"), 0);
  }
  function handleFieldDragEnd(e) {
    this.classList.remove("dragging");
    document.querySelectorAll(".editor-field").forEach((f) => f.classList.remove("drag-over"));
    document.querySelectorAll(".editor-fields-container").forEach((c) => c.classList.remove("drag-over-container"));
    if (state.draggedField) {
      applyNewFieldOrder();
    }
    state.draggedField = null;
  }
  function handleFieldDragOver(e) {
    if (!state.draggedField) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const container = this;
    container.classList.add("drag-over-container");
    const fields = [...container.querySelectorAll(".editor-field:not(.dragging)")];
    const afterElement = getFieldInsertPosition(container, e.clientY);
    document.querySelectorAll(".editor-field").forEach((f) => f.classList.remove("drag-over"));
    if (afterElement) {
      afterElement.classList.add("drag-over");
      container.insertBefore(state.draggedField, afterElement);
    } else {
      container.appendChild(state.draggedField);
    }
  }
  function handleFieldDragLeave(e) {
    this.classList.remove("drag-over-container");
  }
  function handleFieldDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove("drag-over-container");
  }
  function getFieldInsertPosition(container, y) {
    const fields = [...container.querySelectorAll(".editor-field:not(.dragging)")];
    for (const field of fields) {
      const rect = field.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (y < midY) {
        return field;
      }
    }
    return null;
  }
  function applyNewFieldOrder() {
    const container = document.getElementById("editor-sections");
    if (!container) return;
    const fieldContainers = container.querySelectorAll(".editor-fields-container");
    const newSections = state.currentFormStructure.sections.map((section) => ({
      ...section,
      fields: []
    }));
    fieldContainers.forEach((fc) => {
      const sectionIdx = parseInt(fc.dataset.section);
      if (isNaN(sectionIdx) || !newSections[sectionIdx]) return;
      const fieldElements = fc.querySelectorAll(".editor-field");
      fieldElements.forEach((fieldEl) => {
        const oldSectionIdx = parseInt(fieldEl.dataset.section);
        const oldFieldIdx = parseInt(fieldEl.dataset.field);
        if (!isNaN(oldSectionIdx) && !isNaN(oldFieldIdx)) {
          const field = state.currentFormStructure.sections[oldSectionIdx]?.fields[oldFieldIdx];
          if (field) {
            newSections[sectionIdx].fields.push(field);
          }
        }
      });
    });
    state.currentFormStructure.sections = newSections;
    renderEditor();
  }
  function addSection() {
    state.editingSectionIndex = null;
    document.getElementById("modal-section-title").textContent = "Nouvelle section";
    document.getElementById("section-title-input").value = "";
    openModal("modal-section");
  }
  function editSection(idx) {
    state.editingSectionIndex = idx;
    const section = state.currentFormStructure.sections[idx];
    document.getElementById("modal-section-title").textContent = "Modifier la section";
    document.getElementById("section-title-input").value = section.title;
    openModal("modal-section");
  }
  function saveSection() {
    const title = document.getElementById("section-title-input").value.trim();
    if (!title) {
      alert("Le titre est requis");
      return;
    }
    if (state.editingSectionIndex !== null) {
      state.currentFormStructure.sections[state.editingSectionIndex].title = title;
    } else {
      state.currentFormStructure.sections.push({
        id: generateId(title),
        title,
        fields: []
      });
    }
    closeModal("modal-section");
    renderEditor();
  }
  function deleteSection(idx) {
    customConfirm("Supprimer cette section et tous ses champs ?", () => {
      state.currentFormStructure.sections.splice(idx, 1);
      renderEditor();
    });
  }
  function addField(sectionIdx) {
    state.editingSectionIndex = sectionIdx;
    state.editingFieldIndex = null;
    document.getElementById("modal-field-title").textContent = "Ajouter un champ";
    document.getElementById("field-label-input").value = "";
    document.getElementById("field-type-select").value = "text";
    document.getElementById("field-options-input").value = "";
    document.getElementById("field-required-input").checked = false;
    document.getElementById("field-condition-field").value = "";
    document.getElementById("field-condition-value").value = "";
    updateConditionFieldSelect(sectionIdx);
    toggleFieldOptions();
    openModal("modal-field");
  }
  function editField(sectionIdx, fieldIdx) {
    state.editingSectionIndex = sectionIdx;
    state.editingFieldIndex = fieldIdx;
    const field = state.currentFormStructure.sections[sectionIdx].fields[fieldIdx];
    document.getElementById("modal-field-title").textContent = "Modifier le champ";
    document.getElementById("field-label-input").value = field.label;
    document.getElementById("field-type-select").value = field.type;
    document.getElementById("field-options-input").value = (field.options || []).join("\n");
    document.getElementById("field-required-input").checked = field.required || false;
    updateConditionFieldSelect(sectionIdx, fieldIdx);
    if (field.condition) {
      document.getElementById("field-condition-field").value = field.condition.field;
      document.getElementById("field-condition-value").value = field.condition.value;
    } else {
      document.getElementById("field-condition-field").value = "";
      document.getElementById("field-condition-value").value = "";
    }
    toggleFieldOptions();
    toggleConditionValue();
    openModal("modal-field");
  }
  function updateConditionFieldSelect(sectionIdx, excludeFieldIdx = null) {
    const select = document.getElementById("field-condition-field");
    let options = '<option value="">Toujours visible</option>';
    state.currentFormStructure.sections.forEach((section, sIdx) => {
      section.fields.forEach((field, fIdx) => {
        if (sIdx === sectionIdx && fIdx === excludeFieldIdx) return;
        if (["radio", "select", "checkbox"].includes(field.type)) {
          options += `<option value="${escapeHtml(field.id)}">${escapeHtml(field.label)}</option>`;
        }
      });
    });
    select.innerHTML = options;
  }
  function toggleFieldOptions() {
    const type = document.getElementById("field-type-select").value;
    const showOptions = ["select", "radio", "checkbox"].includes(type);
    document.getElementById("field-options-group").style.display = showOptions ? "block" : "none";
  }
  function toggleConditionValue() {
    const fieldId = document.getElementById("field-condition-field").value;
    document.getElementById("field-condition-value-group").style.display = fieldId ? "block" : "none";
  }
  document.getElementById("field-condition-field")?.addEventListener("change", toggleConditionValue);
  function saveField() {
    const label = document.getElementById("field-label-input").value.trim();
    const type = document.getElementById("field-type-select").value;
    const optionsText = document.getElementById("field-options-input").value;
    const required = document.getElementById("field-required-input").checked;
    const conditionField = document.getElementById("field-condition-field").value;
    const conditionValue = document.getElementById("field-condition-value").value;
    if (!label) {
      alert("Le label est requis");
      return;
    }
    const field = {
      id: state.editingFieldIndex !== null ? state.currentFormStructure.sections[state.editingSectionIndex].fields[state.editingFieldIndex].id : generateId(label),
      label,
      type,
      required
    };
    if (["select", "radio", "checkbox"].includes(type)) {
      field.options = optionsText.split("\n").map((o) => o.trim()).filter((o) => o);
      if (field.options.length === 0) {
        alert("Au moins une option est requise");
        return;
      }
    }
    if (conditionField) {
      field.condition = {
        field: conditionField,
        value: conditionValue
      };
    }
    if (state.editingFieldIndex !== null) {
      state.currentFormStructure.sections[state.editingSectionIndex].fields[state.editingFieldIndex] = field;
    } else {
      state.currentFormStructure.sections[state.editingSectionIndex].fields.push(field);
    }
    closeModal("modal-field");
    renderEditor();
  }
  function deleteField(sectionIdx, fieldIdx) {
    customConfirm("Supprimer ce champ ?", () => {
      state.currentFormStructure.sections[sectionIdx].fields.splice(fieldIdx, 1);
      renderEditor();
    });
  }

  // src/admin/form-status.js
  async function saveForm(status = null) {
    const title = document.getElementById("form-title-input").value.trim();
    if (!title) {
      alert("Le titre est requis");
      return;
    }
    state.currentFormStructure.title = title;
    const newStatus = status || state.currentFormStatus;
    try {
      const updatedForm = await api(`/admin/forms/${state.currentFormId}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          structure: state.currentFormStructure,
          status: newStatus
        })
      });
      state.currentFormStatus = updatedForm.status;
      const formIndex = state.forms.findIndex((f) => f.id === state.currentFormId);
      if (formIndex !== -1) {
        state.forms[formIndex] = updatedForm;
      }
      updateFormStatusBadge();
      updateClientLinkButton();
      const statusLabel = newStatus === "active" ? "publi\xE9" : "enregistr\xE9 en brouillon";
      alert(`Formulaire ${statusLabel} !`);
    } catch (error) {
      alert(error.message);
    }
  }
  function updateFormStatusBadge() {
    const badge = document.getElementById("form-status-badge");
    if (!badge) return;
    if (state.currentFormStatus === "active") {
      badge.className = "badge badge-validated";
      badge.textContent = "Publi\xE9";
    } else {
      badge.className = "badge badge-draft";
      badge.textContent = "Brouillon";
    }
  }
  function updateClientLinkButton() {
    const btn = document.getElementById("btn-client-link");
    if (!btn) return;
    if (state.currentFormStatus === "active") {
      btn.disabled = false;
      btn.title = "Voir la version enregistr\xE9e (lien client)";
    } else {
      btn.disabled = true;
      btn.title = "Le formulaire doit \xEAtre publi\xE9 pour \xEAtre accessible";
    }
  }
  function previewForm() {
    sessionStorage.setItem("kiss_form_preview", JSON.stringify(state.currentFormStructure));
    window.open("/preview.html", "_blank");
  }
  function previewSavedForm() {
    const form = state.forms.find((f) => f.id === state.currentFormId);
    if (!form || !form.slug) {
      alert("Le formulaire doit \xEAtre enregistr\xE9 au moins une fois pour avoir un lien.");
      return;
    }
    if (form.status !== "active") {
      alert("Le formulaire est en brouillon. Publiez-le pour le rendre accessible.");
      return;
    }
    window.open(`/f/${form.slug}`, "_blank");
  }

  // src/admin/forms.js
  async function loadForms() {
    state.forms = await api("/admin/forms");
    document.getElementById("new-form-template").innerHTML = `
        <option value="">Formulaire vide</option>
        ${state.templates.map((t) => `<option value="${parseInt(t.id)}">${escapeHtml(t.name)}</option>`).join("")}
    `;
    if (state.forms.length === 0) {
      document.getElementById("forms-list").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucun formulaire</div>
                <p>Cr\xE9ez votre premier formulaire.</p>
            </div>
        `;
    } else {
      document.getElementById("forms-list").innerHTML = `
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
                    ${state.forms.map((f) => {
        const structure = f.structure ? JSON.parse(f.structure) : { sections: [] };
        const sectionsCount = structure.sections?.length || 0;
        const fieldsCount = structure.sections?.reduce((acc, s) => acc + (s.fields?.length || 0), 0) || 0;
        const statusBadge = f.status === "active" ? '<span class="badge badge-validated">Publi\xE9</span>' : '<span class="badge badge-draft">Brouillon</span>';
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
                    `;
      }).join("")}
                </tbody>
            </table>
        `;
    }
  }
  function openFormModal() {
    document.getElementById("new-form-title").value = "";
    document.getElementById("new-form-template").value = "";
    openModal("modal-form");
  }
  async function createForm() {
    const title = document.getElementById("new-form-title").value.trim();
    const template_id = document.getElementById("new-form-template").value || null;
    if (!title) {
      alert("Le titre est requis");
      return;
    }
    try {
      const form = await api("/admin/forms", {
        method: "POST",
        body: JSON.stringify({ title, template_id })
      });
      closeModal("modal-form");
      editForm(form.id);
    } catch (error) {
      alert(error.message);
    }
  }
  async function editForm(id, updateHash = true) {
    const form = await api(`/admin/forms/${id}`);
    state.currentFormId = id;
    state.currentFormStructure = JSON.parse(form.structure);
    state.currentFormStatus = form.status || "draft";
    document.getElementById("editor-title").textContent = "Modifier: " + escapeHtml(form.title);
    document.getElementById("form-title-input").value = state.currentFormStructure.title || form.title;
    updateFormStatusBadge();
    updateClientLinkButton();
    renderEditor();
    showView("form-editor");
    if (updateHash) {
      navigateTo("form", { id });
    }
  }
  async function duplicateForm(id) {
    const title = prompt("Titre du nouveau formulaire:");
    if (!title) return;
    try {
      const form = await api(`/admin/forms/${id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ title })
      });
      loadForms();
      editForm(form.id);
    } catch (error) {
      alert(error.message);
    }
  }
  async function deleteForm(id) {
    customConfirm("Supprimer ce formulaire et toutes ses soumissions ?", async () => {
      await api(`/admin/forms/${id}`, { method: "DELETE" });
      loadForms();
    });
  }

  // src/admin/projects.js
  async function loadProjects() {
    state.projects = await api("/admin/projects");
    if (state.projects.length === 0) {
      document.getElementById("projects-list").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucun projet</div>
                <p>Cr\xE9ez votre premier projet pour organiser vos formulaires.</p>
            </div>
        `;
    } else {
      document.getElementById("projects-list").innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Lien client</th>
                        <th>Formulaires</th>
                        <th>Soumissions</th>
                        <th>Cr\xE9\xE9 le</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.projects.map((p) => {
        const formsCount = parseInt(p.forms_count) || 0;
        return `
                        <tr>
                            <td><strong>${escapeHtml(p.name)}</strong></td>
                            <td>${p.slug ? `<a href="/p/${encodeURIComponent(p.slug)}" target="_blank" class="btn btn-sm btn-secondary">Ouvrir</a>` : "-"}</td>
                            <td>${parseInt(formsCount)}</td>
                            <td><button class="btn btn-sm btn-secondary" onclick="viewProjectSubmissions(${parseInt(p.id)})">Voir</button></td>
                            <td>${escapeHtml(formatDate(p.created_at))}</td>
                            <td class="table-actions">
                                <button class="btn btn-sm btn-secondary" onclick="editProject(${parseInt(p.id)})">Modifier</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteProject(${parseInt(p.id)})">Supprimer</button>
                            </td>
                        </tr>
                    `;
      }).join("")}
                </tbody>
            </table>
        `;
    }
  }
  async function openProjectModal(project = null) {
    state.forms = await api("/admin/forms");
    document.getElementById("modal-project-title").textContent = project ? "Modifier le projet" : "Nouveau projet";
    document.getElementById("project-name-input").value = project?.name || "";
    document.getElementById("project-name-input").dataset.id = project?.id || "";
    state.currentProjectLogo = project?.logo || null;
    state.pendingLogoFile = null;
    document.getElementById("logo-input").value = "";
    if (state.currentProjectLogo) {
      document.getElementById("logo-preview").src = state.currentProjectLogo;
      document.getElementById("logo-preview-container").style.display = "flex";
      document.getElementById("logo-upload-container").style.display = "none";
    } else {
      document.getElementById("logo-preview-container").style.display = "none";
      document.getElementById("logo-upload-container").style.display = "block";
    }
    const style = project?.style || "google";
    document.querySelectorAll('input[name="project-style"]').forEach((radio) => {
      radio.checked = radio.value === style;
    });
    const formsAvailable = document.getElementById("project-forms-available");
    formsAvailable.innerHTML = state.forms.length ? state.forms.map((f) => `
            <label class="checkbox-item">
                <input type="checkbox" value="${parseInt(f.id)}" onchange="toggleProjectForm(this)">
                <span>${escapeHtml(f.title)}</span>
            </label>
        `).join("") : `<p style="color: var(--gray-500); font-size: 13px;">Aucun gabarit. Cr\xE9ez des formulaires dans l'onglet Formulaires.</p>`;
    const formsList = document.getElementById("project-forms-list");
    formsList.innerHTML = "";
    if (project?.id) {
      const instances = await api(`/admin/forms?project_id=${project.id}`);
      formsList.innerHTML = instances.map(
        (f) => renderProjectItem({ kind: "instance", id: f.id, title: f.title })
      ).join("");
    }
    refreshProjectItemsUI();
    openModal("modal-project");
  }
  function renderProjectItem(item) {
    const isInstance = item.kind === "instance";
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
                ${isInstance ? `<button type="button" class="btn btn-sm btn-secondary" onclick="editProjectInstance(${parseInt(item.id)})">Modifier</button>` : '<span class="badge badge-draft">\xE0 ajouter</span>'}
                <button type="button" class="btn btn-sm btn-danger" onclick="removeProjectFormItem(this)">Retirer</button>
            </div>
        </div>
    `;
  }
  function toggleProjectForm(checkbox) {
    const id = parseInt(checkbox.value);
    const list = document.getElementById("project-forms-list");
    if (checkbox.checked) {
      const gabarit = state.forms.find((f) => f.id === id);
      if (gabarit) list.insertAdjacentHTML("beforeend", renderProjectItem({ kind: "template", id, title: gabarit.title }));
    } else {
      const item = list.querySelector(`.sortable-item[data-kind="template"][data-id="${id}"]`);
      if (item) item.remove();
    }
    refreshProjectItemsUI();
  }
  function removeProjectFormItem(btn) {
    const item = btn.closest(".sortable-item");
    if (!item) return;
    if (item.dataset.kind === "template") {
      const cb = document.querySelector(`#project-forms-available input[value="${item.dataset.id}"]`);
      if (cb) cb.checked = false;
    }
    item.remove();
    refreshProjectItemsUI();
  }
  function editProjectInstance(id) {
    closeModal("modal-project");
    editForm(id);
  }
  function refreshProjectItemsUI() {
    const list = document.getElementById("project-forms-list");
    const items = Array.from(list.querySelectorAll(".sortable-item"));
    const placeholder = list.querySelector(".forms-placeholder");
    if (items.length === 0) {
      if (!placeholder) {
        list.insertAdjacentHTML(
          "beforeend",
          '<p class="forms-placeholder" style="color: var(--gray-500); font-size: 13px;">Cochez des gabarits ci-dessus pour composer le projet.</p>'
        );
      }
      return;
    }
    if (placeholder) placeholder.remove();
    items.forEach((item, i) => {
      const numberEl = item.querySelector(".item-number");
      if (numberEl) numberEl.textContent = i + 1;
    });
    setupSortable(list);
  }
  function setupSortable(container) {
    const items = container.querySelectorAll(".sortable-item");
    let draggedItem = null;
    items.forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        draggedItem = item;
        setTimeout(() => item.classList.add("dragging"), 0);
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
        updateSortableNumbers(container);
      });
      item.addEventListener("dragover", (e) => {
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
    const items = container.querySelectorAll(".sortable-item");
    items.forEach((item, i) => {
      const numberEl = item.querySelector(".item-number");
      if (numberEl) numberEl.textContent = i + 1;
    });
  }
  function collectProjectItems() {
    const items = document.querySelectorAll("#project-forms-list .sortable-item");
    return Array.from(items).map((item) => ({ kind: item.dataset.kind, id: parseInt(item.dataset.id) }));
  }
  async function saveProject() {
    const name = document.getElementById("project-name-input").value.trim();
    const id = document.getElementById("project-name-input").dataset.id;
    const style = document.querySelector('input[name="project-style"]:checked')?.value || "google";
    if (!name) {
      alert("Le nom est requis");
      return;
    }
    try {
      const items = collectProjectItems();
      let projectId = id;
      if (id) {
        const order = [];
        for (const item of items) {
          if (item.kind === "instance") {
            order.push(item.id);
          } else {
            const inst = await api(`/admin/projects/${id}/forms`, {
              method: "POST",
              body: JSON.stringify({ template_id: item.id })
            });
            order.push(inst.id);
          }
        }
        await api(`/admin/projects/${id}`, {
          method: "PUT",
          body: JSON.stringify({ name, style, form_order: order })
        });
      } else {
        const newProject = await api("/admin/projects", {
          method: "POST",
          body: JSON.stringify({ name, style, template_ids: items.map((i) => i.id) })
        });
        projectId = newProject.id;
      }
      const existingProject = id ? state.projects.find((p) => p.id === parseInt(id)) : null;
      const existingLogo = existingProject?.logo || null;
      if (state.pendingLogoFile && projectId) {
        const formData = new FormData();
        formData.append("logo", state.pendingLogoFile);
        const uploadResponse = await fetch(`/api/admin/projects/${projectId}/logo`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${state.token}`
          },
          body: formData
        });
        const mediaFormData = new FormData();
        mediaFormData.append("file", state.pendingLogoFile);
        await fetch("/api/admin/media", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${state.token}`
          },
          body: mediaFormData
        });
      } else if (state.currentProjectLogo && state.currentProjectLogo !== existingLogo) {
        await api(`/admin/projects/${projectId}`, {
          method: "PUT",
          body: JSON.stringify({ logo: state.currentProjectLogo })
        });
      } else if (state.currentProjectLogo === null && existingLogo) {
        await fetch(`/api/admin/projects/${id}/logo`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${state.token}`
          }
        });
      }
      closeModal("modal-project");
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
        document.getElementById("logo-preview").src = e.target.result;
        document.getElementById("logo-preview-container").style.display = "flex";
        document.getElementById("logo-upload-container").style.display = "none";
      };
      reader.readAsDataURL(file);
    }
  }
  function removeLogo() {
    state.currentProjectLogo = null;
    state.pendingLogoFile = null;
    document.getElementById("logo-input").value = "";
    document.getElementById("logo-preview-container").style.display = "none";
    document.getElementById("logo-upload-container").style.display = "block";
  }
  async function openMediaLibrary() {
    await loadMediaLibrary();
    openModal("modal-media");
  }
  async function loadMediaLibrary() {
    try {
      state.mediaLibrary = await api("/admin/media");
      renderMediaGrid();
    } catch (error) {
      console.error("Erreur chargement m\xE9diath\xE8que:", error);
    }
  }
  function renderMediaGrid() {
    const grid = document.getElementById("media-grid");
    const emptyState = document.getElementById("media-empty");
    if (state.mediaLibrary.length === 0) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      return;
    }
    grid.style.display = "grid";
    emptyState.style.display = "none";
    grid.innerHTML = state.mediaLibrary.map((media) => `
        <div class="media-item" onclick="selectMedia('${escapeHtml(media.path)}')" title="${escapeHtml(media.original_name)}">
            <img src="${escapeHtml(media.path)}" alt="${escapeHtml(media.original_name)}">
            <div class="media-item-actions">
                <button class="media-item-delete" onclick="event.stopPropagation(); deleteMedia(${parseInt(media.id)})" title="Supprimer">\xD7</button>
            </div>
        </div>
    `).join("");
  }
  async function uploadMedia(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/admin/media", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${state.token}`
        },
        body: formData
      });
      if (!response.ok) throw new Error("Erreur upload");
      const media = await response.json();
      state.mediaLibrary.unshift(media);
      renderMediaGrid();
      input.value = "";
    } catch (error) {
      alert("Erreur lors de l'upload");
    }
  }
  async function deleteMedia(id) {
    if (!window.confirm("Supprimer cette image ?")) return;
    try {
      await api(`/admin/media/${id}`, { method: "DELETE" });
      state.mediaLibrary = state.mediaLibrary.filter((m) => m.id !== id);
      renderMediaGrid();
    } catch (error) {
      alert("Erreur lors de la suppression");
    }
  }
  function selectMedia(path) {
    state.currentProjectLogo = path;
    state.pendingLogoFile = null;
    document.getElementById("logo-preview").src = path;
    document.getElementById("logo-preview-container").style.display = "flex";
    document.getElementById("logo-upload-container").style.display = "none";
    closeModal("modal-media");
  }
  async function editProject(id) {
    const project = state.projects.find((p) => p.id === id);
    openProjectModal(project);
  }
  async function deleteProject(id) {
    customConfirm("Supprimer ce projet et tous ses formulaires ?", async () => {
      try {
        await api(`/admin/projects/${id}`, { method: "DELETE" });
        loadProjects();
        loadForms();
      } catch (error) {
        alert("Erreur: " + error.message);
      }
    });
  }

  // src/admin/dashboard.js
  function showView(viewName) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(`view-${viewName}`).classList.remove("hidden");
    document.querySelectorAll(".sidebar-nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.view === viewName);
    });
    switch (viewName) {
      case "dashboard":
        loadDashboard();
        break;
      case "projects":
        loadProjects();
        break;
      case "forms":
        loadForms();
        break;
      case "submissions":
        loadSubmissions();
        break;
      case "backups":
        loadBackups();
        break;
    }
  }
  async function showAdminView() {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");
    state.templates = await api("/admin/templates");
    state.forms = await api("/admin/forms");
    state.projects = await api("/admin/projects");
    await handleRoute();
  }
  async function loadDashboard() {
    const [stats, allProjects, allForms] = await Promise.all([
      api("/admin/stats"),
      api("/admin/projects"),
      api("/admin/forms")
    ]);
    const statsGridEl = document.getElementById("stats-grid");
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
    let projectsHtml = "";
    if (allProjects.length === 0) {
      projectsHtml = '<p class="text-muted">Aucun projet</p>';
    } else {
      projectsHtml = `
            <div class="dashboard-list">
                ${allProjects.map((p) => {
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
      }).join("")}
            </div>
        `;
    }
    const dashboardProjectsEl = document.getElementById("dashboard-projects");
    if (dashboardProjectsEl) dashboardProjectsEl.innerHTML = projectsHtml;
    let formsHtml = "";
    if (allForms.length === 0) {
      formsHtml = '<p class="text-muted">Aucun formulaire</p>';
    } else {
      formsHtml = `
            <div class="dashboard-list">
                ${allForms.slice(0, 6).map((f) => {
        const structure = f.structure ? JSON.parse(f.structure) : { sections: [] };
        const fieldsCount = structure.sections?.reduce((acc, s) => acc + (s.fields?.length || 0), 0) || 0;
        return `
                        <div class="dashboard-item">
                            <div class="dashboard-item-info">
                                <span class="dashboard-item-name">${escapeHtml(f.title)}</span>
                                <span class="dashboard-item-meta">${parseInt(fieldsCount)} champ(s)</span>
                            </div>
                            <div class="dashboard-item-actions">
                                <button class="btn btn-xs btn-ghost" onclick="editForm(${parseInt(f.id)})" title="\xC9diter">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                ${f.slug ? `
                                    <a href="/f/${encodeURIComponent(f.slug)}" target="_blank" class="btn btn-xs btn-ghost" title="Pr\xE9visualiser">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                    </a>
                                ` : ""}
                            </div>
                        </div>
                    `;
      }).join("")}
            </div>
            ${allForms.length > 6 ? `<a href="#forms" class="dashboard-more" onclick="navigateTo('forms')">Voir tous les formulaires \u2192</a>` : ""}
        `;
    }
    const dashboardFormsEl = document.getElementById("dashboard-forms");
    if (dashboardFormsEl) dashboardFormsEl.innerHTML = formsHtml;
    let recentSubmissions = [];
    for (const form of allForms.slice(0, 5)) {
      try {
        const formId = parseInt(form.id);
        if (isNaN(formId) || formId <= 0) continue;
        const subs = await api(`/admin/forms/${formId}/submissions`);
        if (Array.isArray(subs)) {
          recentSubmissions = recentSubmissions.concat(
            subs.slice(0, 3).map((s) => ({ ...s, form_title: form.title }))
          );
        }
      } catch (e) {
      }
    }
    recentSubmissions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const recentSubsEl = document.getElementById("recent-submissions");
    if (!recentSubsEl) return;
    if (recentSubmissions.length === 0) {
      recentSubsEl.innerHTML = '<p class="text-muted">Aucune soumission r\xE9cente</p>';
    } else {
      recentSubsEl.innerHTML = `
            <div class="dashboard-list">
                ${recentSubmissions.slice(0, 5).map((s) => `
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
                `).join("")}
            </div>
        `;
    }
  }

  // src/admin/api.js
  async function api(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...state.token ? { "Authorization": `Bearer ${state.token}` } : {}
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
        throw new Error(data.error || "Erreur serveur");
      }
      return data;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  }
  async function login(e) {
    e.preventDefault();
    const password = document.getElementById("password").value;
    const errorEl = document.getElementById("login-error");
    try {
      const data = await api("/admin/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      state.token = data.token;
      localStorage.setItem("kiss_admin_token", state.token);
      errorEl.classList.add("hidden");
      showAdminView();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
    }
  }
  function logout() {
    state.token = null;
    localStorage.removeItem("kiss_admin_token");
    document.getElementById("admin-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("password").value = "";
  }
  async function downloadBackup() {
    const btn = document.getElementById("backup-btn");
    const originalHTML = btn.innerHTML;
    const iconLoading = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
    const iconSuccess = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const iconError = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    try {
      btn.style.pointerEvents = "none";
      btn.innerHTML = `${iconLoading}<span class="nav-tool-text">Chargement...</span>`;
      const response = await fetch("/api/admin/backup", {
        headers: {
          "Authorization": `Bearer ${state.token}`
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur de t\xE9l\xE9chargement");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition && disposition.match(/filename="(.+)"/);
      a.download = filenameMatch ? filenameMatch[1] : "kiss-forms-backup.db";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      btn.innerHTML = `${iconSuccess}<span class="nav-tool-text">Backup OK!</span>`;
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.pointerEvents = "";
      }, 2e3);
    } catch (error) {
      console.error("Erreur backup:", error);
      btn.innerHTML = `${iconError}<span class="nav-tool-text">Erreur</span>`;
      alert(error.message);
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.pointerEvents = "";
      }, 2e3);
    }
  }
  async function checkSession() {
    if (!state.token) return false;
    try {
      await api("/admin/check-session");
      return true;
    } catch {
      return false;
    }
  }

  // src/admin/exports.js
  async function exportSubmissionPDF(id) {
    try {
      const response = await fetch(`/api/admin/submissions/${id}/pdf`, {
        headers: {
          "Authorization": `Bearer ${state.token}`
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'export");
      }
      const disposition = response.headers.get("Content-Disposition");
      let filename = "soumission.pdf";
      if (disposition) {
        const matches = disposition.match(/filename="(.+)"/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Erreur: " + error.message);
    }
  }
  async function exportProjectPDF(projectId) {
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/submissions/pdf`, {
        headers: {
          "Authorization": `Bearer ${state.token}`
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'export");
      }
      const disposition = response.headers.get("Content-Disposition");
      let filename = "soumissions.pdf";
      if (disposition) {
        const matches = disposition.match(/filename="(.+)"/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Erreur: " + error.message);
    }
  }
  async function exportSubmissionJPG(id) {
    try {
      const response = await fetch(`/api/admin/submissions/${id}/jpg`, {
        headers: {
          "Authorization": `Bearer ${state.token}`
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'export");
      }
      const disposition = response.headers.get("Content-Disposition");
      let filename = "formulaire.jpg";
      if (disposition) {
        const matches = disposition.match(/filename="(.+)"/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Erreur: " + error.message);
    }
  }
  async function exportProjectJPG(projectId) {
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/submissions/jpg`, {
        headers: {
          "Authorization": `Bearer ${state.token}`
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'export");
      }
      const disposition = response.headers.get("Content-Disposition");
      let filename = "soumissions.zip";
      if (disposition) {
        const matches = disposition.match(/filename="(.+)"/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Erreur: " + error.message);
    }
  }

  // src/admin/submissions.js
  async function viewProjectSubmissions(projectId, updateHash = true) {
    state.currentProjectId = projectId;
    const project = state.projects.find((p) => p.id === projectId);
    document.getElementById("submissions-title").textContent = `Soumissions - ${project?.name || "Projet"}`;
    state.currentSubmissionFilter = "submitted";
    const filterSelect = document.getElementById("submissions-status-filter");
    if (filterSelect) filterSelect.value = state.currentSubmissionFilter;
    await loadSubmissions();
    showView("submissions");
    if (updateHash) {
      navigateTo("project", { id: projectId });
    }
  }
  function filterSubmissions() {
    const filterSelect = document.getElementById("submissions-status-filter");
    state.currentSubmissionFilter = filterSelect.value;
    loadSubmissions();
  }
  function goBackToSubmissions() {
    if (state.currentProjectId) {
      navigateTo("project", { id: state.currentProjectId });
    } else {
      navigateTo("projects");
    }
  }
  async function loadSubmissions() {
    if (!state.currentProjectId) {
      document.getElementById("submissions-list").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">S\xE9lectionnez un projet</div>
                <p>Acc\xE9dez aux soumissions depuis la liste des projets.</p>
            </div>
        `;
      return;
    }
    const project = state.projects.find((p) => p.id === state.currentProjectId);
    if (!project) {
      document.getElementById("submissions-list").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Projet introuvable</div>
                <p>Ce projet n'existe plus ou a \xE9t\xE9 supprim\xE9.</p>
            </div>
        `;
      return;
    }
    const instances = await api(`/admin/forms?project_id=${state.currentProjectId}`);
    if (!Array.isArray(instances) || instances.length === 0) {
      document.getElementById("submissions-list").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucun formulaire</div>
                <p>Ce projet n'a pas encore de formulaires associ\xE9s.</p>
            </div>
        `;
      return;
    }
    state.projectSubmissionsData = [];
    for (const form of instances) {
      try {
        const subs = await api(`/admin/forms/${form.id}/submissions`);
        if (!Array.isArray(subs)) continue;
        const sortedSubs = subs.map((s) => ({ ...s, form_title: form.title, form_id: form.id })).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
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
    const filteredData = state.projectSubmissionsData.map((formData) => {
      let filtered = formData.submissions;
      if (state.currentSubmissionFilter && state.currentSubmissionFilter !== "all") {
        filtered = formData.submissions.filter((s) => s.status === state.currentSubmissionFilter);
      }
      return { ...formData, filteredSubmissions: filtered };
    });
    const totalSubmissions = filteredData.reduce((sum, f) => sum + f.filteredSubmissions.length, 0);
    if (totalSubmissions === 0) {
      const filterLabel = state.currentSubmissionFilter === "all" ? "" : ` avec le statut "${escapeHtml(getStatusLabel(state.currentSubmissionFilter))}"`;
      document.getElementById("submissions-list").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-title">Aucune soumission${filterLabel}</div>
                <p>Les soumissions de ce projet appara\xEEtront ici.</p>
            </div>
        `;
      return;
    }
    document.getElementById("submissions-list").innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <span style="color: var(--gray-600);">${instances.length} formulaire(s), ${totalSubmissions} soumission(s)</span>
            <button class="btn btn-primary" onclick="exportProjectJPG(${parseInt(state.currentProjectId)})">
                Exporter tout (ZIP)
            </button>
        </div>
        <div class="submissions-grouped">
            ${filteredData.map((formData) => {
      const subs = formData.filteredSubmissions;
      if (subs.length === 0) {
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
                                ${hasMultipleVersions ? `<button class="versions-toggle" onclick="toggleVersions(this)">${subs.length} versions</button>` : ""}
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
                                    <div class="version-row ${idx === 0 ? "version-current" : ""}">
                                        <span class="version-number">${idx === 0 ? "Actuelle" : "v" + (subs.length - idx)}</span>
                                        <span class="badge badge-${escapeHtml(s.status)}">${escapeHtml(getStatusLabel(s.status))}</span>
                                        <span class="version-date">${escapeHtml(formatDate(s.updated_at))}</span>
                                        <div class="version-row-actions">
                                            <button class="btn btn-xs btn-ghost" onclick="viewSubmission(${parseInt(s.id)})">Voir</button>
                                            <button class="btn btn-xs btn-ghost" onclick="exportSubmissionJPG(${parseInt(s.id)})">JPG</button>
                                            ${idx > 0 ? `<button class="btn btn-xs btn-ghost-danger" onclick="deleteSubmission(${parseInt(s.id)})">\xD7</button>` : ""}
                                        </div>
                                    </div>
                                `).join("")}
                            </div>
                        ` : ""}
                    </div>
                `;
    }).join("")}
        </div>
    `;
  }
  function toggleVersions(btn) {
    const group = btn.closest(".form-submissions-group");
    if (!group) return;
    const panel = group.querySelector(".versions-panel");
    if (!panel) return;
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "block" : "none";
    btn.classList.toggle("active", isHidden);
  }
  async function viewSubmission(id, updateHash = true) {
    const submission = await api(`/admin/submissions/${id}`);
    const data = JSON.parse(submission.data);
    const structure = JSON.parse(submission.form_structure);
    if (updateHash) {
      navigateTo("submission", { id });
    }
    let html = `
        <div class="message message-${submission.status === "submitted" ? "warning" : submission.status === "validated" ? "success" : "info"}" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Statut: <strong>${escapeHtml(getStatusLabel(submission.status))}</strong> | Derni\xE8re mise \xE0 jour: ${escapeHtml(formatDate(submission.updated_at))}</span>
            <button class="btn btn-primary" onclick="exportSubmissionJPG(${parseInt(submission.id)})">
                Exporter JPG
            </button>
        </div>
        <h3 style="margin-bottom: 20px;">${escapeHtml(submission.form_title)}</h3>
    `;
    structure.sections.forEach((section) => {
      html += `<h4 style="margin: 20px 0 15px; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(section.title)}</h4>`;
      section.fields.forEach((field) => {
        const value = data[field.id];
        let displayValue = "-";
        if (value !== void 0 && value !== null && value !== "") {
          if (Array.isArray(value)) {
            displayValue = value.join(", ");
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
    document.getElementById("submission-detail-content").innerHTML = html;
    showView("submission-detail");
  }
  async function changeSubmissionStatus(id, currentStatus) {
    const statuses = ["draft", "submitted", "validated", "archived"];
    const nextStatus = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];
    if (window.confirm(`Changer le statut en "${getStatusLabel(nextStatus)}" ?`)) {
      await api(`/admin/submissions/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus })
      });
      loadSubmissions();
    }
  }
  async function deleteSubmission(id) {
    customConfirm("Supprimer cette soumission ?", async () => {
      await api(`/admin/submissions/${id}`, { method: "DELETE" });
      loadSubmissions();
    });
  }

  // src/admin/router.js
  function navigateTo(route, params = {}) {
    let hash = route;
    if (params.id) {
      hash += "/" + params.id;
    }
    window.location.hash = hash;
  }
  function parseRoute() {
    const hash = window.location.hash.slice(1) || "dashboard";
    const parts = hash.split("/");
    return {
      view: parts[0],
      id: parts[1] ? parseInt(parts[1], 10) : null
    };
  }
  async function handleRoute() {
    const route = parseRoute();
    try {
      switch (route.view) {
        case "dashboard":
          showView("dashboard");
          break;
        case "projects":
          showView("projects");
          break;
        case "forms":
          showView("forms");
          break;
        case "project":
          if (route.id && Number.isInteger(route.id) && route.id > 0) {
            await viewProjectSubmissions(route.id, false);
          } else {
            navigateTo("projects");
          }
          break;
        case "form":
          if (route.id && Number.isInteger(route.id) && route.id > 0) {
            await editForm(route.id, false);
          } else {
            navigateTo("forms");
          }
          break;
        case "submission":
          if (route.id && Number.isInteger(route.id) && route.id > 0) {
            await viewSubmission(route.id, false);
          } else {
            navigateTo("dashboard");
          }
          break;
        case "backups":
          showView("backups");
          break;
        default:
          navigateTo("dashboard");
      }
    } catch (error) {
      console.error("Erreur de navigation:", error);
      navigateTo("dashboard");
    }
  }
  window.addEventListener("hashchange", handleRoute);

  // src/admin/index.js
  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("login-form").addEventListener("submit", login);
    document.getElementById("logout-btn").addEventListener("click", logout);
    document.querySelectorAll(".sidebar-nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo(a.dataset.view);
      });
    });
    if (await checkSession()) showAdminView();
  });
  Object.assign(window, {
    navigateTo,
    login,
    logout,
    downloadBackup,
    loadBackups,
    createBackup,
    downloadBackupFile,
    deleteBackup,
    showView,
    showAdminView,
    loadDashboard,
    loadProjects,
    openProjectModal,
    toggleProjectForm,
    removeProjectFormItem,
    editProjectInstance,
    saveProject,
    previewLogo,
    removeLogo,
    openMediaLibrary,
    uploadMedia,
    deleteMedia,
    selectMedia,
    editProject,
    deleteProject,
    loadForms,
    openFormModal,
    createForm,
    editForm,
    duplicateForm,
    deleteForm,
    renderEditor,
    addSection,
    editSection,
    saveSection,
    deleteSection,
    addField,
    editField,
    saveField,
    deleteField,
    toggleFieldOptions,
    toggleConditionValue,
    saveForm,
    updateFormStatusBadge,
    previewForm,
    previewSavedForm,
    viewProjectSubmissions,
    filterSubmissions,
    goBackToSubmissions,
    loadSubmissions,
    toggleVersions,
    viewSubmission,
    changeSubmissionStatus,
    deleteSubmission,
    exportSubmissionPDF,
    exportProjectPDF,
    exportSubmissionJPG,
    exportProjectJPG,
    openModal,
    closeModal,
    customConfirm,
    formatDate,
    getStatusLabel,
    escapeHtml
  });
})();
//# sourceMappingURL=admin.bundle.js.map
