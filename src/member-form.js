import { Modal, Tab } from "bootstrap";
import { fieldDefinitions, formSections, paidAmountDefaults } from "./member-config.js";
import { cloneMember, createEmptyMember, formatMemberName, normalizeMember } from "./member-domain.js";
import { asBoolean, calculateAge, formatIsoDate, roundCurrency } from "./member-utils.js";
import { state } from "./state.js";
import { showToast } from "./ui.js";

const MIN_MEMBER_AGE = 55;

export const createMemberForm = ({
  createMember,
  invalidateMemberPhotoCache,
  loadMemberChangeHistory,
  refreshAllViews,
  refreshRecentChanges,
  renderMemberHistory,
  resolveMemberPhotoDataUrl,
  setFallbackPhoto,
  updateMember,
  uploadMemberPhoto
}) => {
  let modal = null;
  let selectedPhotoFile = null;
  let selectedPhotoObjectUrl = null;

  const updateSelectionChips = fieldKey => {
    const input = document.getElementById(`field-${fieldKey}`);
    const container = document.getElementById(`field-${fieldKey}-chips`);
    if (!input || !container) return;
    Array.from(container.children).forEach(chip => {
      const selected = Array.from(input.selectedOptions).some(option => option.value === chip.dataset.value);
      chip.classList.toggle("is-selected", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
  };

  const createSelectionChips = field => {
    const container = document.createElement("div");
    container.id = `field-${field.key}-chips`;
    container.className = "member-form-selection-chips";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", `${field.label} auswählen`);
    field.options.forEach(option => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "member-form-selection-chip";
      chip.dataset.value = String(option.value);
      chip.textContent = option.label;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        const input = document.getElementById(`field-${field.key}`);
        const selectedOption = Array.from(input?.options || []).find(item => item.value === chip.dataset.value);
        if (!selectedOption) return;
        selectedOption.selected = !selectedOption.selected;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      container.appendChild(chip);
    });
    return container;
  };

  const applyPaidAmountDefault = checkboxKey => {
    const config = paidAmountDefaults[checkboxKey];
    const checkbox = document.getElementById(`field-${checkboxKey}`);
    const amountInput = config ? document.getElementById(`field-${config.amountField}`) : null;
    const dateInput = config?.dateField ? document.getElementById(`field-${config.dateField}`) : null;
    if (!checkbox?.checked) {
      if (amountInput) amountInput.value = "";
      if (dateInput) dateInput.value = "";
      return;
    }
    if (amountInput && config.amount !== undefined) amountInput.value = String(config.amount);
    if (dateInput && !dateInput.value) dateInput.value = formatIsoDate(new Date());
  };

  const createField = (field, className = "") => {
    const col = document.createElement("div");
    col.dataset.fieldKey = field.key;
    col.className = className || (field.type === "textarea"
      ? "col-12 member-form-field"
      : field.type === "checkbox"
        ? "col-sm-6 col-lg-4 member-form-field"
        : field.type === "radio"
          ? "col-sm-6 member-form-field"
          : "col-md-6 member-form-field");

    if (field.type === "checkbox") {
      const wrap = document.createElement("div");
      const input = document.createElement("input");
      const label = document.createElement("label");
      wrap.className = "form-check";
      input.type = "checkbox";
      input.className = "form-check-input";
      input.id = `field-${field.key}`;
      input.dataset.fieldKey = field.key;
      label.className = "form-check-label";
      label.setAttribute("for", input.id);
      label.textContent = field.label;
      if (paidAmountDefaults[field.key]) input.addEventListener("change", () => applyPaidAmountDefault(field.key));
      wrap.append(input, label);
      col.appendChild(wrap);
      return col;
    }

    const label = document.createElement("label");
    label.className = "form-label";
    label.setAttribute("for", `field-${field.key}`);
    label.textContent = field.label;

    const input = (() => {
      if (field.type === "textarea") {
        const element = document.createElement("textarea");
        element.rows = 4;
        element.className = "form-control";
        return element;
      }
      if (field.type === "radio") {
        const element = document.createElement("div");
        element.className = "radio-group";
        field.options.forEach(option => {
          const wrap = document.createElement("div");
          const radio = document.createElement("input");
          const radioLabel = document.createElement("label");
          wrap.className = "form-check d-inline-block me-3";
          radio.type = "radio";
          radio.className = "form-check-input";
          radio.name = `field-${field.key}`;
          radio.value = String(option.value);
          radio.id = `field-${field.key}-${option.value}`;
          radio.dataset.fieldKey = field.key;
          radioLabel.className = "form-check-label";
          radioLabel.setAttribute("for", radio.id);
          radioLabel.textContent = option.label;
          wrap.append(radio, radioLabel);
          element.appendChild(wrap);
        });
        return element;
      }
      if (field.type === "select" || field.type === "multiselect") {
        const element = document.createElement("select");
        element.className = field.type === "select" ? "form-select" : "member-form-selection-input";
        if (field.type === "multiselect") {
          element.multiple = true;
          element.tabIndex = -1;
          element.setAttribute("aria-hidden", "true");
          element.addEventListener("change", () => updateSelectionChips(field.key));
        } else if (field.allowEmpty) {
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "-";
          element.appendChild(empty);
        }
        field.options.forEach(option => {
          const optionElement = document.createElement("option");
          optionElement.value = String(option.value);
          optionElement.textContent = option.label;
          element.appendChild(optionElement);
        });
        return element;
      }
      const element = document.createElement("input");
      element.className = "form-control";
      element.type = field.type === "currency" ? "number" : field.type;
      if (field.type === "currency") {
        element.step = "0.01";
        element.min = "0";
      }
      return element;
    })();

    input.id = `field-${field.key}`;
    input.dataset.fieldKey = field.key;
    if (field.required) input.required = true;
    if (["name", "vorname"].includes(field.key)) {
      input.addEventListener("input", () => updatePhotoPreview(readPreview()));
    }
    col.append(label, input);
    if (field.type === "multiselect") col.appendChild(createSelectionChips(field));
    return col;
  };

  const createGroup = (group, fieldByKey) => {
    const wrapper = document.createElement("section");
    const title = document.createElement("h3");
    const fields = document.createElement("div");
    wrapper.className = "member-form-group";
    if (group.visibleWhen) wrapper.dataset.visibleWhen = group.visibleWhen;
    title.className = "member-form-group__title";
    title.textContent = group.label;
    fields.className = "row g-3";
    group.fieldKeys.forEach(fieldKey => {
      const field = fieldByKey.get(fieldKey);
      if (field) fields.appendChild(createField(field));
    });
    wrapper.append(title, fields);
    return wrapper;
  };

  const clearSelectedPhoto = () => {
    if (selectedPhotoObjectUrl) URL.revokeObjectURL(selectedPhotoObjectUrl);
    selectedPhotoFile = null;
    selectedPhotoObjectUrl = null;
    const input = document.getElementById("memberPhotoUploadInput");
    if (input) input.value = "";
  };

  const readPreview = () => ({
    name: document.getElementById("field-name")?.value || "",
    vorname: document.getElementById("field-vorname")?.value || "",
    passbild: ""
  });

  const updatePhotoPreview = member => {
    const preview = document.getElementById("memberPhotoPreviewImage");
    if (!preview) return;
    setFallbackPhoto(preview);
    preview.className = "member-photo-preview__image member-photo member-photo--fallback";
    const showPhoto = (source, alt) => {
      const image = document.createElement("img");
      image.className = "member-photo__image";
      image.alt = alt;
      preview.className = "member-photo-preview__image member-photo";
      preview.title = alt;
      preview.setAttribute("aria-label", alt);
      preview.replaceChildren(image);
      image.src = source;
      return image;
    };
    if (selectedPhotoFile && selectedPhotoObjectUrl) {
      showPhoto(selectedPhotoObjectUrl, `Ausgewähltes Passfoto von ${formatMemberName(member)}`);
      return;
    }
    resolveMemberPhotoDataUrl(member).then(photoDataUrl => {
      if (!photoDataUrl) return;
      const image = showPhoto(photoDataUrl, `Passfoto von ${formatMemberName(member)}`);
      image.addEventListener("error", () => {
        setFallbackPhoto(preview);
        preview.classList.add("member-photo-preview__image");
      }, { once: true });
    }).catch(() => {});
  };

  const handlePhotoSelection = event => {
    const file = event.target.files?.[0] || null;
    clearSelectedPhoto();
    if (!file) {
      updatePhotoPreview(readPreview());
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showToast("Bitte ein JPG-, PNG- oder WebP-Bild auswählen.");
      event.target.value = "";
      updatePhotoPreview(readPreview());
      return;
    }
    selectedPhotoFile = file;
    selectedPhotoObjectUrl = URL.createObjectURL(file);
    updatePhotoPreview(readPreview());
  };

  const createPhotoPreview = () => {
    const preview = document.createElement("div");
    const photo = document.createElement("div");
    const text = document.createElement("div");
    const title = document.createElement("div");
    const fileInput = document.createElement("input");
    const uploadLabel = document.createElement("label");
    preview.className = "member-photo-preview";
    preview.id = "memberPhotoPreview";
    photo.className = "member-photo-preview__image member-photo member-photo--fallback";
    photo.id = "memberPhotoPreviewImage";
    setFallbackPhoto(photo);
    photo.classList.add("member-photo-preview__image");
    text.className = "member-photo-preview__text";
    title.className = "member-photo-preview__title";
    title.textContent = "Passbild";
    fileInput.className = "member-photo-preview__input";
    fileInput.id = "memberPhotoUploadInput";
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.addEventListener("change", handlePhotoSelection);
    uploadLabel.className = "btn btn-outline-secondary btn-sm member-photo-preview__button";
    uploadLabel.setAttribute("for", fileInput.id);
    uploadLabel.textContent = "Passfoto wählen";
    text.append(title, uploadLabel, fileInput);
    preview.append(photo, text);
    return preview;
  };

  const build = () => {
    const container = document.getElementById("formFields");
    const hiddenIdInput = document.createElement("input");
    const fieldByKey = new Map(fieldDefinitions.map(field => [field.key, field]));
    const tabs = document.createElement("ul");
    const tabContent = document.createElement("div");
    container.innerHTML = "";
    hiddenIdInput.type = "hidden";
    hiddenIdInput.id = "field-id";
    hiddenIdInput.dataset.fieldKey = "id";
    tabs.className = "nav nav-pills member-form-tabs";
    tabs.id = "memberFormTabs";
    tabs.role = "tablist";
    tabContent.className = "tab-content member-form-tab-content";
    tabContent.id = "memberFormTabContent";

    formSections.forEach((section, index) => {
      const isActive = index === 0;
      const tabId = `member-form-${section.id}-tab`;
      const paneId = `member-form-${section.id}-pane`;
      const tabItem = document.createElement("li");
      const tabButton = document.createElement("button");
      const pane = document.createElement("div");
      const row = document.createElement("div");
      tabItem.className = "nav-item";
      tabItem.role = "presentation";
      tabButton.className = `nav-link${isActive ? " active" : ""}`;
      tabButton.id = tabId;
      tabButton.type = "button";
      tabButton.role = "tab";
      tabButton.dataset.bsToggle = "tab";
      tabButton.dataset.bsTarget = `#${paneId}`;
      tabButton.setAttribute("aria-controls", paneId);
      tabButton.setAttribute("aria-selected", String(isActive));
      tabButton.textContent = section.label;
      pane.className = `tab-pane fade${isActive ? " show active" : ""}`;
      pane.id = paneId;
      pane.role = "tabpanel";
      pane.setAttribute("aria-labelledby", tabId);
      pane.tabIndex = 0;
      row.className = section.groups ? "member-payment-groups" : "row g-3";
      if (section.id === "basis") pane.appendChild(createPhotoPreview());
      if (section.groups) {
        section.groups.forEach(group => row.appendChild(createGroup(group, fieldByKey)));
      } else if (section.id === "verein") {
        section.fieldKeys.slice(0, 4).forEach(fieldKey => {
          const field = fieldByKey.get(fieldKey);
          if (field) row.appendChild(createField(field));
        });
        const interests = fieldByKey.get("interessengruppen");
        if (interests) row.appendChild(createField(interests));
        const functions = document.createElement("div");
        functions.className = "col-md-6 member-form-field-stack";
        ["funktion", "ausweisErteilt"].forEach(fieldKey => {
          const field = fieldByKey.get(fieldKey);
          if (field) functions.appendChild(createField(field, "member-form-field"));
        });
        row.appendChild(functions);
      } else {
        section.fieldKeys.forEach(fieldKey => {
          const field = fieldByKey.get(fieldKey);
          if (field) row.appendChild(createField(field));
        });
      }
      tabItem.appendChild(tabButton);
      tabs.appendChild(tabItem);
      pane.appendChild(row);
      tabContent.appendChild(pane);
    });

    const changesTabItem = document.createElement("li");
    const changesTabButton = document.createElement("button");
    const changesPane = document.createElement("div");
    const changesContainer = document.createElement("div");
    changesTabItem.className = "nav-item";
    changesTabItem.role = "presentation";
    changesTabButton.className = "nav-link";
    changesTabButton.id = "member-form-changes-tab";
    changesTabButton.type = "button";
    changesTabButton.role = "tab";
    changesTabButton.dataset.bsToggle = "tab";
    changesTabButton.dataset.bsTarget = "#member-form-changes-pane";
    changesTabButton.setAttribute("aria-controls", "member-form-changes-pane");
    changesTabButton.setAttribute("aria-selected", "false");
    changesTabButton.addEventListener("shown.bs.tab", () => loadMemberChangeHistory(state.editingId, state.editingId === null));
    changesTabButton.textContent = "Änderungen";
    changesPane.className = "tab-pane fade";
    changesPane.id = "member-form-changes-pane";
    changesPane.role = "tabpanel";
    changesPane.setAttribute("aria-labelledby", changesTabButton.id);
    changesPane.tabIndex = 0;
    changesContainer.className = "member-change-history";
    changesContainer.id = "memberChangeHistory";
    changesPane.appendChild(changesContainer);
    changesTabItem.appendChild(changesTabButton);
    tabs.appendChild(changesTabItem);
    tabContent.appendChild(changesPane);
    container.append(hiddenIdInput, tabs, tabContent);
  };

  const fill = (member, isNew) => {
    fieldDefinitions.forEach(field => {
      const input = document.getElementById(`field-${field.key}`);
      if (!input) return;
      const raw = member[field.key];
      if (field.type === "checkbox") {
        input.checked = asBoolean(raw);
      } else if (field.type === "multiselect") {
        const rawValues = Array.isArray(raw) ? raw : String(raw || "").split(/[|,;]/).map(value => value.trim()).filter(Boolean);
        const values = new Set(rawValues.map(String));
        Array.from(input.options).forEach(option => { option.selected = values.has(option.value); });
        updateSelectionChips(field.key);
      } else if (field.type === "radio") {
        const value = raw === null || raw === undefined ? "" : String(raw);
        const radio = document.querySelector(`input[name="field-${field.key}"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else {
        input.value = raw === null || raw === undefined ? "" : String(raw);
      }
    });
    updatePhotoPreview(member);
    const idInput = document.getElementById("field-id");
    if (idInput) {
      if (isNew) idInput.value = String(state.nextId);
      idInput.readOnly = !isNew;
    }
  };

  const read = () => {
    const member = {};
    fieldDefinitions.forEach(field => {
      const input = document.getElementById(`field-${field.key}`);
      if (!input) return;
      if (field.type === "checkbox") member[field.key] = input.checked;
      else if (field.type === "multiselect") {
        const values = Array.from(input.selectedOptions).map(option => option.value);
        member[field.key] = field.valueType === "textList" ? values.join("; ") : values.map(Number);
      } else if (field.type === "date") member[field.key] = input.value || "";
      else if (field.type === "number") member[field.key] = input.value === "" ? 0 : Number(input.value);
      else if (field.type === "currency") member[field.key] = input.value === "" ? 0 : roundCurrency(Number(input.value));
      else if (field.type === "select") {
        member[field.key] = input.value === ""
          ? null
          : ["weihnachtsessen", "austrittsgrund"].includes(field.key) ? Number(input.value) : input.value;
      } else if (field.type === "radio") {
        member[field.key] = document.querySelector(`input[name="field-${field.key}"]:checked`)?.value || "";
      } else member[field.key] = (input.value || "").trim();
    });
    return normalizeMember(member);
  };

  // Der Datensatz ist hier bereits gespeichert - ein gescheiterter Bild-Upload darf ihn
  // nicht aus der Liste halten, sonst zeigt das Grid einen veralteten Stand.
  const uploadSelectedPhoto = async member => {
    if (!selectedPhotoFile) return member;
    try {
      const photo = await uploadMemberPhoto(member.id, selectedPhotoFile);
      invalidateMemberPhotoCache(member.id);
      return { ...member, passbild: photo.fileName || member.passbild, hasPassbildInDb: true };
    } catch (error) {
      console.warn("Passfoto konnte nicht hochgeladen werden.", error);
      showToast("Passfoto konnte nicht hochgeladen werden.");
      return member;
    }
  };

  // Nur ein Hinweis, keine Sperre: Gaeste koennen juenger sein, ein vertipptes Jahr faellt trotzdem auf.
  const warnAboutMinimumAge = member => {
    const age = calculateAge(member.geburtstag);
    if (age !== null && age < MIN_MEMBER_AGE) {
      showToast(`Hinweis: Das Geburtsdatum ergibt ein Alter von ${age} Jahren.`);
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    let formData = read();
    if (!formData.name || !formData.vorname) {
      showToast("Name und Vorname sind Pflichtfelder.");
      return;
    }
    if (state.editingId === null) {
      if (state.members.some(member => member.id === formData.id)) {
        showToast(`Die ID ${formData.id} existiert bereits. Bitte eine andere ID wählen.`);
        return;
      }
      try {
        formData = await createMember(formData);
      } catch (error) {
        console.warn("Mitglied konnte nicht angelegt werden.", error);
        showToast(error.message || "Speichern in der Datenbank fehlgeschlagen.");
        return;
      }
      formData = await uploadSelectedPhoto(formData);
      state.members.push(formData);
      state.nextId = Math.max(state.nextId, formData.id + 1);
    } else {
      const index = state.members.findIndex(member => member.id === state.editingId);
      if (index < 0) {
        showToast("Der Datensatz wurde nicht gefunden.");
        return;
      }
      formData.id = state.editingId;
      formData.passbild = state.members[index].passbild || "";
      try {
        formData = await updateMember(formData);
      } catch (error) {
        console.warn("Mitglied konnte nicht gespeichert werden.", error);
        showToast(error.message || "Speichern in der Datenbank fehlgeschlagen.");
        return;
      }
      formData = await uploadSelectedPhoto(formData);
      state.members[index] = formData;
    }
    warnAboutMinimumAge(formData);
    state.members.sort((a, b) => a.name.localeCompare(b.name, "de") || a.vorname.localeCompare(b.vorname, "de"));
    clearSelectedPhoto();
    modal.hide();
    refreshAllViews();
    if (document.getElementById("changes-pane")?.classList.contains("active")) refreshRecentChanges({ force: true });
  };

  const open = memberId => {
    const isNew = memberId === null || memberId === undefined;
    const member = isNew ? createEmptyMember(state.nextId) : cloneMember(state.members.find(item => item.id === memberId));
    if (!member) return;
    document.getElementById("memberModalLabel").textContent = isNew ? "Neues Mitglied anlegen" : "Mitglied bearbeiten";
    state.editingId = isNew ? null : member.id;
    clearSelectedPhoto();
    fill(member, isNew);
    renderMemberHistory([], {
      message: isNew
        ? "Änderungen werden nach dem ersten Speichern protokolliert."
        : "Änderungsverlauf wird beim Öffnen des Tabs geladen..."
    });
    const firstTab = document.querySelector("#memberFormTabs .nav-link");
    if (firstTab) Tab.getOrCreateInstance(firstTab).show();
    modal.show();
  };

  const init = () => {
    build();
    modal ||= new Modal(document.getElementById("memberModal"));
    const form = document.getElementById("memberForm");
    if (!form.dataset.memberFormWired) {
      form.addEventListener("submit", handleSubmit);
      form.dataset.memberFormWired = "true";
    }
  };

  return { build, init, open };
};
