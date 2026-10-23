import { Modal } from "bootstrap";
import {
  austrittsgrundMap,
  funktionsMap,
  interestGroups,
  refreshReferenceOptions,
  replaceArrayContents,
  replaceObjectContents,
  seniorenclubsMap
} from "./member-config.js";

const sections = [
  {
    type: "interest-groups",
    labelName: "Bezeichnung",
    createTitle: "Neue Interessengruppe anlegen",
    editTitle: "Interessengruppe umbenennen",
    helpText: "Diese Bezeichnung erscheint später bei der Auswahl der Interessengruppen eines Mitglieds.",
    editAction: "Umbenennen"
  },
  {
    type: "functions",
    labelName: "Bezeichnung",
    createTitle: "Neue Funktion anlegen",
    editTitle: "Funktion bearbeiten",
    helpText: "Diese Bezeichnung erscheint später bei der Auswahl der Funktionen eines Mitglieds."
  },
  {
    type: "exit-reasons",
    labelName: "Bezeichnung",
    createTitle: "Neuen Austrittsgrund anlegen",
    editTitle: "Austrittsgrund bearbeiten",
    helpText: "Dieser Grund kann später beim Austritt eines Mitglieds ausgewählt werden."
  },
  {
    type: "senior-clubs",
    labelName: "Name",
    createTitle: "Neuen Seniorenclub anlegen",
    editTitle: "Seniorenclub bearbeiten",
    helpText: "Dieser Name erscheint später bei der Auswahl der Clubzugehörigkeit eines Mitglieds."
  }
];

export const createReferenceAdmin = ({
  createItem,
  deleteItem,
  dirtyForms,
  loadAll,
  loadItems,
  onReferenceDataChanged,
  updateItem
}) => {
  let adminData = {};
  let modal = null;
  const formFor = type => document.querySelector(`[data-reference-type="${type}"] .reference-form`);
  const sectionFor = type => sections.find(section => section.type === type);
  // Bearbeiten/Abbrechen/(De)aktivieren ersetzen den Inhalt der Maske - offene Eingaben erst nach Rueckfrage
  const afterConfirm = (type, proceed) => () => dirtyForms.confirmLeave(formFor(type), proceed);

  const applyData = data => {
    if (Array.isArray(data?.interestGroups)) {
      replaceArrayContents(interestGroups, data.interestGroups.map(item => ({ id: Number(item.id), label: item.label || item.name || "" })));
    }
    if (Array.isArray(data?.seniorClubs)) {
      replaceArrayContents(seniorenclubsMap, data.seniorClubs.map(item => ({ id: Number(item.id), name: item.name || item.label || "" })));
    }
    if (Array.isArray(data?.exitReasons)) {
      replaceObjectContents(austrittsgrundMap, data.exitReasons.map(item => [Number(item.id), item.label || item.name || ""]));
    }
    if (Array.isArray(data?.functions)) {
      replaceObjectContents(funktionsMap, data.functions.map(item => [Number(item.id), item.label || item.name || ""]));
    }
    refreshReferenceOptions();
  };

  const load = async () => {
    const data = await loadAll();
    const requiredCollections = ["interestGroups", "seniorClubs", "exitReasons", "functions"];
    if (!requiredCollections.every(key => Array.isArray(data?.[key]))) {
      throw new Error("Stammdaten-Antwort ist unvollstaendig.");
    }
    applyData(data);
  };

  const loadAdminData = async () => {
    const entries = await Promise.all(sections.map(async section => {
      const data = await loadItems(section.type);
      return [section.type, data.items || []];
    }));
    adminData = Object.fromEntries(entries);
  };

  const getItems = type => {
    if (adminData[type]) return adminData[type].map(item => ({
      id: Number(item.id),
      label: item.label || item.name || "",
      active: item.active !== false
    }));
    if (type === "interest-groups") return interestGroups.map(item => ({ id: item.id, label: item.label }));
    if (type === "functions") return Object.entries(funktionsMap).map(([id, label]) => ({ id: Number(id), label }));
    if (type === "exit-reasons") return Object.entries(austrittsgrundMap).map(([id, label]) => ({ id: Number(id), label }));
    if (type === "senior-clubs") return seniorenclubsMap.map(item => ({ id: item.id, label: item.name }));
    return [];
  };

  const resetForm = type => {
    const pane = document.querySelector(`[data-reference-type="${type}"]`);
    if (!pane) return;
    pane.querySelector('[data-reference-field="id"]').value = "";
    pane.querySelector('[data-reference-field="label"]').value = "";
    pane.querySelector('[data-reference-role="form-title"]').textContent = sectionFor(type).createTitle;
    pane.querySelector('[data-reference-action="submit"]').textContent = "Anlegen";
    document.getElementById("referenceDataError").hidden = true;
    dirtyForms.markClean(formFor(type));
  };

  const fillForm = (type, item) => {
    const pane = document.querySelector(`[data-reference-type="${type}"]`);
    if (!pane) return;
    pane.querySelector('[data-reference-field="id"]').value = item.id;
    const labelInput = pane.querySelector('[data-reference-field="label"]');
    labelInput.value = item.label;
    pane.querySelector('[data-reference-role="form-title"]').textContent = sectionFor(type).editTitle;
    pane.querySelector('[data-reference-action="submit"]').textContent = "Änderungen speichern";
    document.getElementById("referenceDataError").hidden = true;
    dirtyForms.markClean(formFor(type));
    formFor(type).scrollIntoView({ block: "nearest" });
    labelInput.focus();
  };

  const refreshAfterSave = async () => {
    await load();
    await loadAdminData();
    onReferenceDataChanged();
    renderAllTables();
  };

  const toggleItem = async (type, item) => {
    const errorElement = document.getElementById("referenceDataError");
    try {
      errorElement.hidden = true;
      await (item.active === false
        ? updateItem(type, { id: item.id, label: item.label, active: true })
        : deleteItem(type, item.id));
      resetForm(type);
      await refreshAfterSave();
    } catch (error) {
      errorElement.textContent = error.message || "Stammdatensatz konnte nicht aktualisiert werden.";
      errorElement.hidden = false;
    }
  };

  const renderTable = type => {
    const tbody = document.querySelector(`[data-reference-type="${type}"] tbody`);
    if (!tbody) return;
    const rows = getItems(type).sort((a, b) => a.id - b.id).map(item => {
      const row = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = item.label;
      const statusCell = document.createElement("td");
      statusCell.textContent = item.active === false ? "inaktiv" : "aktiv";
      const actions = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.className = "btn btn-sm btn-outline-secondary me-2";
      editButton.type = "button";
      editButton.textContent = sections.find(section => section.type === type)?.editAction || "Bearbeiten";
      editButton.addEventListener("click", afterConfirm(type, () => fillForm(type, item)));
      const toggleButton = document.createElement("button");
      toggleButton.className = item.active === false ? "btn btn-sm btn-outline-primary" : "btn btn-sm btn-outline-danger";
      toggleButton.type = "button";
      toggleButton.textContent = item.active === false ? "Aktivieren" : "Deaktivieren";
      toggleButton.addEventListener("click", afterConfirm(type, () => toggleItem(type, item)));
      actions.append(editButton, toggleButton);
      row.classList.toggle("text-muted", item.active === false);
      row.append(labelCell, statusCell, actions);
      return row;
    });
    tbody.replaceChildren(...rows);
  };

  const renderAllTables = () => sections.forEach(section => renderTable(section.type));

  const handleSubmit = async (event, type) => {
    event.preventDefault();
    const errorElement = document.getElementById("referenceDataError");
    const pane = event.target.closest("[data-reference-type]");
    const id = Number(pane.querySelector('[data-reference-field="id"]').value);
    const item = {
      ...(id ? { id } : {}),
      label: pane.querySelector('[data-reference-field="label"]').value.trim()
    };
    try {
      errorElement.hidden = true;
      await (id ? updateItem(type, item) : createItem(type, item));
      resetForm(type);
      await refreshAfterSave();
    } catch (error) {
      errorElement.textContent = error.message || "Stammdaten konnten nicht gespeichert werden.";
      errorElement.hidden = false;
    }
  };

  const build = () => {
    const panes = document.getElementById("referenceDataPanes");
    if (!panes) return;
    sections.forEach(section => {
      const pane = document.querySelector(`[data-reference-type="${section.type}"]`);
      if (!pane || pane.dataset.built === "true") return;
      pane.dataset.built = "true";
      pane.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm align-middle reference-table">
            <thead><tr><th>${section.labelName}</th><th>Status</th><th></th></tr></thead><tbody></tbody>
          </table>
        </div>
        <form class="reference-form" aria-labelledby="reference-${section.type}-form-title">
          <div class="reference-form__header">
            <h3 class="h6 mb-1" id="reference-${section.type}-form-title" data-reference-role="form-title">${section.createTitle}</h3>
            <p class="reference-form__help mb-0">${section.helpText}</p>
          </div>
          <input type="hidden" data-reference-field="id">
          <div class="reference-form__field">
            <label class="form-label" for="reference-${section.type}-label">${section.labelName}</label>
            <input class="form-control" id="reference-${section.type}-label" type="text" data-reference-field="label" required>
          </div>
          <div class="reference-form__actions">
            <button class="btn btn-outline-secondary" type="button" data-reference-action="cancel" data-bs-dismiss="modal">Abbrechen</button>
            <button class="btn btn-primary" type="submit" data-reference-action="submit">Anlegen</button>
          </div>
        </form>`;
      pane.querySelector(".reference-form").addEventListener("submit", event => handleSubmit(event, section.type));
      dirtyForms.register(pane.querySelector(".reference-form"));
    });
  };

  const open = async () => {
    const errorElement = document.getElementById("referenceDataError");
    try {
      errorElement.hidden = true;
      build();
      await loadAdminData();
      renderAllTables();
    } catch (error) {
      errorElement.textContent = error.message || "Stammdaten konnten nicht geladen werden.";
      errorElement.hidden = false;
    }
    modal.show();
  };

  const init = () => {
    if (!modal) {
      const modalElement = document.getElementById("referenceDataModal");
      modal = new Modal(modalElement);
      dirtyForms.guardModal(modalElement, () => modal.hide());
      modalElement.addEventListener("hidden.bs.modal", () => sections.forEach(section => resetForm(section.type)));
    }
    build();
    const button = document.getElementById("manageReferenceDataBtn");
    if (button.dataset.wired !== "true") {
      button.dataset.wired = "true";
      button.addEventListener("click", open);
    }
  };

  return { init, load };
};
