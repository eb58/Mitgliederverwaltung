import { Modal, Tab } from "bootstrap";
import { fieldDefinitions, formSections, paidAmountDefaults } from "./member-config.js";
import { cloneMember, createEmptyMember, formatMemberName, istBeitragBezahlt, normalizeMember, validateMember } from "./member-domain.js";
import { asBoolean, formatIsoDate, roundCurrency } from "./member-utils.js";
import { state } from "./state.js";
import { showToast } from "./ui.js";

const ADDRESS_FIELDS = ["strasse", "plz", "ort"];
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
// "Kontakt › PLZ" fuer den Hinweisbereich
const fieldPath = fieldKey => {
  const section = formSections.find(item => [...(item.fieldKeys || []), ...(item.groups || []).flatMap(group => group.fieldKeys)].includes(fieldKey));
  const label = fieldDefinitions.find(field => field.key === fieldKey)?.label || fieldKey;
  return section ? `${section.label} › ${label}` : label;
};

export const createMemberForm = ({
  checkAddress,
  createMember,
  invalidateMemberPhotoCache,
  loadMemberChangeHistory,
  refreshAllViews,
  refreshRecentChanges,
  renderMemberHistory,
  resolveMemberPhotoDataUrl,
  setFallbackPhoto,
  showOnMap,
  updateMember,
  uploadMemberPhoto
}) => {
  let modal = null;
  // Ungespeicherte Eingaben: Schliessen nur nach Rueckfrage
  let dirty = false;
  // Was nach dem Verwerfen noch passieren soll (z.B. Sprung zur Karte)
  let afterDiscard = null;
  // Stand beim Oeffnen: Warnungen gelten nur fuer geaenderte Felder
  let originalMember = null;
  // Warnungen, die der Nutzer gesehen hat: ein zweiter Klick auf "Trotzdem speichern" speichert
  let acknowledgedHints = null;
  // Ergebnis der (langsamen) OSM-Adresspruefung je Anschrift, damit der zweite Klick nicht erneut wartet
  let addressCheck = { key: null, result: null };
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

  const paidCheckboxKeyForAmount = amountField => Object.entries(paidAmountDefaults)
    .find(([, config]) => config.amountField === amountField)?.[0];

  const applyPaidCheckboxFromAmount = amountField => {
    const checkboxKey = paidCheckboxKeyForAmount(amountField);
    const checkbox = checkboxKey ? document.getElementById(`field-${checkboxKey}`) : null;
    const amountInput = document.getElementById(`field-${amountField}`);
    if (checkbox && amountInput) checkbox.checked = istBeitragBezahlt(amountInput.value);
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
        if (paidCheckboxKeyForAmount(field.key)) {
          element.addEventListener("input", () => applyPaidCheckboxFromAmount(field.key));
        }
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

    // Kein Reiter, sondern ein Sprung zur Karte (gezeigt wird die gespeicherte Anschrift)
    const mapItem = document.createElement("li");
    mapItem.className = "nav-item member-form-tabs__map";
    mapItem.innerHTML = `<button type="button" id="memberShowOnMapBtn" class="btn member-form-map-btn" title="Wohnort auf der Karte zeigen"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>Auf Karte zeigen</button>`;
    mapItem.querySelector("button").addEventListener("click", () => {
      const memberId = state.editingId;
      // Bei ungespeicherten Aenderungen erst nach "Verwerfen" zur Karte
      if (dirty) afterDiscard = () => showOnMap(memberId);
      modal.hide();
      if (!dirty) showOnMap(memberId);
    });
    tabs.appendChild(mapItem);
    container.append(hiddenIdInput, tabs, tabContent);
    // Mitgliederdaten sind keine eigenen Adressen: Chrome soll sie nicht im Google-Konto speichern wollen.
    // "off" und unbekannte Werte uebergeht Chrome und erkennt die Felder an Beschriftung/ID. Ein bekannter
    // Nicht-Adresstyp hat dagegen Vorrang; ohne Strasse, PLZ und Ort bietet Chrome keine Adresse zum Speichern an.
    container.querySelectorAll("input, select, textarea").forEach(element => {
      element.setAttribute("autocomplete", ADDRESS_FIELDS.includes(element.dataset.fieldKey) ? "one-time-code" : `mitglied-${element.dataset.fieldKey || element.name || "feld"}`);
    });
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
    if (idInput) idInput.readOnly = !isNew;
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

  // Markiert Felder mit Fehler (rot) oder Warnung (gelb) und zeigt den Reiter des ersten markierten Felds
  const fieldContainer = field => document.querySelector(`#formFields div[data-field-key="${field}"]`);
  const clearFieldMarks = (container = document.getElementById("formFields")) => {
    container.querySelectorAll(".member-form-feedback").forEach(element => element.remove());
    [container, ...container.querySelectorAll(".member-form-field--error, .member-form-field--warning")].forEach(element => element.classList.remove("member-form-field--error", "member-form-field--warning"));
    container.querySelectorAll(".is-invalid").forEach(element => element.classList.remove("is-invalid"));
  };
  const markFields = (entries, kind) => {
    entries.forEach(({ field, message }) => {
      const container = fieldContainer(field);
      if (!container) return;
      container.classList.add(`member-form-field--${kind}`);
      if (kind === "error") container.querySelectorAll("input, select, textarea").forEach(element => element.classList.add("is-invalid"));
      container.insertAdjacentHTML("beforeend", `<div class="member-form-feedback member-form-feedback--${kind}"></div>`);
      container.lastElementChild.textContent = message;
    });
    const first = entries.find(({ field }) => fieldContainer(field));
    if (first) showTabOf(first.field);
  };

  const submitButton = () => document.querySelector('#memberForm button[type="submit"]');
  const showTabOf = field => {
    const container = fieldContainer(field);
    const pane = container?.closest(".tab-pane");
    const tab = pane && document.querySelector(`#memberFormTabs [data-bs-target="#${pane.id}"]`);
    if (tab) Tab.getOrCreateInstance(tab).show();
    return container;
  };
  const resetSubmitButton = () => {
    acknowledgedHints = null;
    submitButton().textContent = "Speichern";
    submitButton().classList.replace("btn-warning", "btn-primary");
  };
  const hideReview = () => {
    document.getElementById("memberFormReview").hidden = true;
    resetSubmitButton();
  };
  // Nach einer Korrektur: Hinweise zu diesem Feld entfernen; jede Aenderung verlangt eine neue Pruefung ("Speichern")
  const clearReviewFor = field => {
    const review = document.getElementById("memberFormReview");
    if (review.hidden) return;
    review.querySelectorAll("li[data-fields]").forEach(item => { if (item.dataset.fields.split(" ").includes(field)) item.remove(); });
    if (!review.querySelector("li")) hideReview();
    else resetSubmitButton();
  };
  const showReview = (kind, entries) => {
    const review = document.getElementById("memberFormReview");
    const isError = kind === "error";
    review.className = `member-form-review member-form-review--${kind}`;
    review.innerHTML = `
      <div class="member-form-review__head">
        <strong>${isError ? "Bitte korrigieren" : "Bitte prüfen"}</strong>
        <span>${isError ? "Diese Angaben können so nicht gespeichert werden." : "Diese Angaben sind ungewöhnlich. Korrigieren oder mit „Trotzdem speichern“ übernehmen."}</span>
      </div>
      <ul class="member-form-review__list">${entries.map((entry, index) => `
        <li data-fields="${escapeHtml(entry.address ? ADDRESS_FIELDS.join(" ") : entry.field)}">
          <div><span class="member-form-review__field">${escapeHtml(fieldPath(entry.field))}</span> ${escapeHtml(entry.message)}</div>
          <div class="member-form-review__actions">
            ${entry.suggestion ? `<button type="button" class="btn btn-sm btn-outline-dark" data-review-apply="${index}">${escapeHtml([entry.suggestion.plz, entry.suggestion.ort].filter(Boolean).join(" "))} übernehmen</button>` : ""}
            <button type="button" class="btn btn-sm btn-link" data-review-field="${escapeHtml(entry.field)}">Zum Feld</button>
          </div>
        </li>`).join("")}
      </ul>`;
    review.hidden = false;
    review.querySelectorAll("[data-review-field]").forEach(button => button.addEventListener("click", () => {
      showTabOf(button.dataset.reviewField)?.querySelector("input, select, textarea")?.focus();
    }));
    review.querySelectorAll("[data-review-apply]").forEach(button => button.addEventListener("click", () => {
      const { suggestion } = entries[Number(button.dataset.reviewApply)];
      [["plz", suggestion.plz], ["ort", suggestion.ort]].filter(([, value]) => value).forEach(([field, value]) => {
        const input = document.getElementById(`field-${field}`);
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }));
    if (!isError) {
      submitButton().textContent = "Trotzdem speichern";
      submitButton().classList.replace("btn-primary", "btn-warning");
    }
    review.scrollIntoView({ block: "nearest" });
  };
  const hintKey = hints => hints.map(hint => `${hint.field}:${hint.message}`).join("|");

  const handleSubmit = async event => {
    event.preventDefault();
    let formData = read();
    clearFieldMarks();
    const { errors, warnings } = validateMember(formData, { original: originalMember, members: state.members });
    if (errors.length) {
      markFields(errors, "error");
      showReview("error", errors);
      if (!formData.name || !formData.vorname) showToast("Name und Vorname sind Pflichtfelder.");
      return;
    }
    // Adresse nur bei Aenderung gegen OpenStreetMap pruefen (dauert bis zu drei Sekunden)
    const addressChanged = formData.strasse && (!originalMember || ADDRESS_FIELDS.some(field => (formData[field] || "") !== (originalMember[field] || "")));
    const addressKey = ADDRESS_FIELDS.map(field => formData[field] || "").join("|");
    if (addressChanged && addressCheck.key !== addressKey) {
      const button = submitButton();
      const label = button.textContent;
      button.disabled = true;
      button.textContent = "Adresse wird geprüft …";
      addressCheck = { key: addressKey, result: await checkAddress(formData) };
      button.disabled = false;
      button.textContent = label;
    }
    const addressHint = addressChanged ? addressCheck.result : null;
    const hints = [...warnings, ...(addressHint ? [{ field: "strasse", ...addressHint, address: true }] : [])];
    if (hints.length && hintKey(hints) !== acknowledgedHints) {
      markFields(hints, "warning");
      showReview("warning", hints);
      acknowledgedHints = hintKey(hints);
      return;
    }
    if (state.editingId === null) {
      try {
        formData = await createMember(formData);
      } catch (error) {
        console.warn("Mitglied konnte nicht angelegt werden.", error);
        showToast(error.message || "Speichern in der Datenbank fehlgeschlagen.");
        return;
      }
      formData = await uploadSelectedPhoto(formData);
      state.members.push(formData);
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
    state.members.sort((a, b) => a.name.localeCompare(b.name, "de") || a.vorname.localeCompare(b.vorname, "de"));
    clearSelectedPhoto();
    dirty = false;
    modal.hide();
    refreshAllViews();
    if (document.getElementById("changes-pane")?.classList.contains("active")) refreshRecentChanges({ force: true });
  };

  const open = memberId => {
    const isNew = memberId === null || memberId === undefined;
    const member = isNew ? createEmptyMember() : cloneMember(state.members.find(item => item.id === memberId));
    if (!member) return;
    document.getElementById("memberModalLabel").textContent = isNew ? "Neues Mitglied anlegen" : "Mitglied bearbeiten";
    state.editingId = isNew ? null : member.id;
    clearSelectedPhoto();
    fill(member, isNew);
    clearFieldMarks();
    hideReview();
    addressCheck = { key: null, result: null };
    originalMember = isNew ? null : cloneMember(member);
    dirty = false;
    toggleDiscardBar(false);
    renderMemberHistory([], {
      message: isNew
        ? "Änderungen werden nach dem ersten Speichern protokolliert."
        : "Änderungsverlauf wird beim Öffnen des Tabs geladen..."
    });
    document.getElementById("memberShowOnMapBtn").hidden = isNew;
    const firstTab = document.querySelector("#memberFormTabs .nav-link");
    if (firstTab) Tab.getOrCreateInstance(firstTab).show();
    modal.show();
  };

  // Statt Browser-Dialog: Leiste im Fuss der Maske mit Verwerfen / Weiter bearbeiten (Speichern bleibt daneben)
  const toggleDiscardBar = show => {
    document.getElementById("memberFormDiscard").hidden = !show;
    document.querySelector("#memberModal .member-form-cancel").hidden = show;
    if (show) document.querySelector('#memberFormDiscard [data-discard="cancel"]').focus();
    else afterDiscard = null;
  };

  const init = () => {
    build();
    modal ||= new Modal(document.getElementById("memberModal"));
    const form = document.getElementById("memberForm");
    if (!form.dataset.memberFormWired) {
      form.addEventListener("submit", handleSubmit);
      ["input", "change"].forEach(type => form.addEventListener(type, event => {
        dirty = true;
        const container = event.target.closest?.("div[data-field-key]");
        if (container && !event.target.matches("[type=file]")) {
          clearFieldMarks(container);
          clearReviewFor(container.dataset.fieldKey);
        }
      }));
      // Gilt fuer Kreuz, Abbrechen, Esc, Klick neben den Dialog und den Kartenknopf
      document.getElementById("memberModal").addEventListener("hide.bs.modal", event => {
        if (!dirty) return;
        event.preventDefault();
        toggleDiscardBar(true);
      });
      document.getElementById("memberFormDiscard").addEventListener("click", event => {
        const action = event.target.closest("[data-discard]")?.dataset.discard;
        if (!action) return;
        const next = afterDiscard;
        toggleDiscardBar(false);
        if (action !== "confirm") return;
        dirty = false;
        modal.hide();
        next?.();
      });
      window.addEventListener("beforeunload", event => { if (dirty) event.preventDefault(); });
      form.dataset.memberFormWired = "true";
    }
  };

  return { build, init, open };
};
