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
  { type: "interest-groups", labelName: "Bezeichnung" },
  { type: "functions", labelName: "Bezeichnung" },
  { type: "exit-reasons", labelName: "Bezeichnung" },
  { type: "senior-clubs", labelName: "Name" }
];

export const createReferenceAdmin = ({
  createItem,
  deleteItem,
  loadAll,
  loadItems,
  onReferenceDataChanged,
  updateItem
}) => {
  let adminData = {};
  let modal = null;

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
    try {
      applyData(await loadAll());
    } catch (error) {
      console.warn("Stammdaten konnten nicht ueber die API geladen werden.", error);
    }
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
    const idInput = pane.querySelector('[data-reference-field="newId"]');
    idInput.value = "";
    idInput.disabled = false;
    pane.querySelector('[data-reference-field="label"]').value = "";
    document.getElementById("referenceDataError").hidden = true;
  };

  const fillForm = (type, item) => {
    const pane = document.querySelector(`[data-reference-type="${type}"]`);
    if (!pane) return;
    pane.querySelector('[data-reference-field="id"]').value = item.id;
    const idInput = pane.querySelector('[data-reference-field="newId"]');
    idInput.value = item.id;
    idInput.disabled = true;
    pane.querySelector('[data-reference-field="label"]').value = item.label;
    document.getElementById("referenceDataError").hidden = true;
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
      const idCell = document.createElement("td");
      idCell.textContent = item.id;
      const labelCell = document.createElement("td");
      labelCell.textContent = item.label;
      const statusCell = document.createElement("td");
      statusCell.textContent = item.active === false ? "inaktiv" : "aktiv";
      const actions = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.className = "btn btn-sm btn-outline-secondary me-2";
      editButton.type = "button";
      editButton.textContent = "Bearbeiten";
      editButton.addEventListener("click", () => fillForm(type, item));
      const toggleButton = document.createElement("button");
      toggleButton.className = item.active === false ? "btn btn-sm btn-outline-primary" : "btn btn-sm btn-outline-danger";
      toggleButton.type = "button";
      toggleButton.textContent = item.active === false ? "Aktivieren" : "Deaktivieren";
      toggleButton.addEventListener("click", () => toggleItem(type, item));
      actions.append(editButton, toggleButton);
      row.classList.toggle("text-muted", item.active === false);
      row.append(idCell, labelCell, statusCell, actions);
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
      id: id || Number(pane.querySelector('[data-reference-field="newId"]').value),
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
        <form class="reference-form">
          <input type="hidden" data-reference-field="id">
          <div><label class="form-label">ID</label><input class="form-control" type="number" min="1" step="1" data-reference-field="newId" required></div>
          <div><label class="form-label">${section.labelName}</label><input class="form-control" type="text" data-reference-field="label" required></div>
          <div class="reference-form__actions">
            <button class="btn btn-outline-secondary" type="button" data-reference-action="new">Neu</button>
            <button class="btn btn-primary" type="submit">Speichern</button>
          </div>
        </form>
        <div class="table-responsive mt-3">
          <table class="table table-sm align-middle reference-table">
            <thead><tr><th>ID</th><th>${section.labelName}</th><th>Status</th><th></th></tr></thead><tbody></tbody>
          </table>
        </div>`;
      pane.querySelector(".reference-form").addEventListener("submit", event => handleSubmit(event, section.type));
      pane.querySelector('[data-reference-action="new"]').addEventListener("click", () => resetForm(section.type));
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
    modal = modal || new Modal(document.getElementById("referenceDataModal"));
    build();
    const button = document.getElementById("manageReferenceDataBtn");
    if (button.dataset.wired !== "true") {
      button.dataset.wired = "true";
      button.addEventListener("click", open);
    }
  };

  return { init, load };
};
