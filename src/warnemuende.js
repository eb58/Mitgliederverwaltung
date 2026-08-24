import { Modal } from "bootstrap";
import { retryAsync } from "./member-utils.js";
import { showToast } from "./ui.js";
import { MAX_SEATS, mealOptions, numberParticipants, summarizeMeals, toParticipantPayload } from "./warnemuende-domain.js";

export const createWarnemuendeAdmin = ({
  createGrid,
  createParticipant,
  deleteParticipant,
  loadParticipants,
  updateParticipant
}) => {
  let gridApi = null;
  let participants = [];
  let editModal = null;
  let editingId = null;

  const setMessage = (elementId, message) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
  };

  const setError = message => setMessage("warnemuendeError", message);
  const setEditError = message => setMessage("warnemuendeEditError", message);

  const render = () => {
    const rows = numberParticipants(participants);
    gridApi?.setGridOption("rowData", rows);
    const summary = document.getElementById("warnemuendeSummary");
    const nachruecker = rows.filter(row => row.nachruecker).length;
    if (summary) summary.textContent = [
      `${participants.length} Teilnehmer`,
      ...(nachruecker ? [`${nachruecker} Nachrücker ab Platz ${MAX_SEATS + 1}`] : []),
      summarizeMeals(participants),
      `bezahlt: ${participants.filter(participant => participant.bezahlt).length}`
    ].join(" · ");
  };

  // Faengt seine Ladefehler selbst ab: eine fehlende Teilnehmertabelle soll den Start
  // der uebrigen Ansichten nicht verhindern.
  const load = async () => {
    try {
      participants = await retryAsync(loadParticipants);
      render();
    } catch (error) {
      participants = [];
      render();
      setError(error.message || "Teilnehmer konnten nicht geladen werden.");
      if (error?.sessionExpired) throw error;
    }
  };

  const handleCellValueChanged = async event => {
    try {
      setError("");
      const updated = await updateParticipant({ id: event.data.id, ...toParticipantPayload(event.data) });
      participants = participants.map(participant => participant.id === updated.id ? updated : participant);
      render();
      showToast(`${updated.vorname} ${updated.name} gespeichert.`);
    } catch (error) {
      setError(error.message || "Teilnehmer konnte nicht gespeichert werden.");
      load();
    }
  };

  const handleDelete = async participant => {
    if (!confirm(`${participant.vorname} ${participant.name} aus der Teilnehmerliste entfernen?`)) return;
    try {
      setError("");
      await deleteParticipant(participant.id);
      participants = participants.filter(entry => entry.id !== participant.id);
      render();
      showToast(`${participant.vorname} ${participant.name} entfernt.`);
    } catch (error) {
      setError(error.message || "Teilnehmer konnte nicht entfernt werden.");
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const form = event.target;
    try {
      setError("");
      const created = await createParticipant(toParticipantPayload({
        name: form.elements.name.value,
        vorname: form.elements.vorname.value,
        essensauswahl: form.elements.essensauswahl.value,
        bemerkung: form.elements.bemerkung.value
      }));
      participants = [...participants, created];
      render();
      form.reset();
      setFormMeal(mealOptions[0]);
      form.elements.name.focus();
      showToast(`${created.vorname} ${created.name} hinzugefügt.`);
    } catch (error) {
      setError(error.message || "Teilnehmer konnte nicht angelegt werden.");
    }
  };

  const createMealChips = (selected, onSelect) => {
    const group = document.createElement("div");
    group.className = "meal-chips";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Essensauswahl");
    group.append(...mealOptions.map(option => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "meal-chip";
      chip.dataset.value = option;
      chip.textContent = option;
      chip.classList.toggle("is-selected", option === selected);
      chip.setAttribute("aria-pressed", String(option === selected));
      chip.addEventListener("click", () => onSelect(option));
      return chip;
    }));
    return group;
  };

  const getEditColumn = () => ({
    headerName: "",
    colId: "bearbeiten",
    pinned: "left",
    width: 68,
    minWidth: 68,
    maxWidth: 68,
    cellClass: "edit-cell",
    headerClass: "edit-header",
    editable: false,
    sortable: false,
    filter: false,
    suppressMovable: true,
    cellRenderer: params => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "edit-icon-btn";
      button.title = "Teilnehmer bearbeiten";
      button.setAttribute("aria-label", "Teilnehmer bearbeiten");
      button.innerHTML = `
        <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M4 20h4.8L19.1 9.7l-4.8-4.8L4 15.2V20z"></path>
          <path d="M15.7 3.5l4.8 4.8"></path>
        </svg>
      `;
      button.addEventListener("click", () => openEdit(params.data));
      return button;
    }
  });

  const getDeleteColumn = () => ({
    headerName: "",
    colId: "entfernen",
    pinned: "right",
    width: 68,
    minWidth: 68,
    maxWidth: 68,
    cellClass: "edit-cell",
    headerClass: "edit-header",
    editable: false,
    sortable: false,
    filter: false,
    suppressMovable: true,
    cellRenderer: params => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "edit-icon-btn";
      button.title = "Teilnehmer entfernen";
      button.setAttribute("aria-label", "Teilnehmer entfernen");
      button.innerHTML = `
        <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M5 7h14"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M6 7l1 13h10l1-13"></path>
          <path d="M9 7V4h6v3"></path>
        </svg>
      `;
      button.addEventListener("click", () => handleDelete(params.data));
      return button;
    }
  });

  const getColumns = () => [
    {
      headerName: "Nr.",
      field: "nr",
      sort: "asc",
      pinned: "left",
      width: 88,
      minWidth: 88,
      maxWidth: 88,
      editable: false,
      filter: false,
      suppressMovable: true
    },
    getEditColumn(),
    { headerName: "Name", field: "name", minWidth: 150 },
    { headerName: "Vorname", field: "vorname", minWidth: 150 },
    {
      headerName: "Essensauswahl",
      field: "essensauswahl",
      editable: false,
      cellClass: "meal-cell",
      minWidth: 260,
      cellRenderer: params => createMealChips(params.value, meal => {
        if (meal !== params.value) params.node.setDataValue("essensauswahl", meal);
      })
    },
    {
      headerName: "bezahlt",
      field: "bezahlt",
      editable: true,
      cellRenderer: "agCheckboxCellRenderer",
      cellEditor: "agCheckboxCellEditor",
      minWidth: 120
    },
    { headerName: "Bemerkung", field: "bemerkung", minWidth: 180, flex: 1 },
    getDeleteColumn()
  ];

  const setMealField = (formSelector, containerId, meal) => {
    const input = document.querySelector(`${formSelector} [name="essensauswahl"]`);
    const container = document.getElementById(containerId);
    if (!input || !container) return;
    input.value = meal;
    container.replaceChildren(createMealChips(meal, next => setMealField(formSelector, containerId, next)));
  };

  const setFormMeal = meal => setMealField("#warnemuendeForm", "warnemuendeEssensauswahl", meal);
  const setEditMeal = meal => setMealField("#warnemuendeEditForm", "warnemuendeEditEssensauswahl", meal);

  const buildForm = () => setFormMeal(mealOptions[0]);

  const openEdit = participant => {
    const form = document.getElementById("warnemuendeEditForm");
    if (!form || !editModal) return;
    editingId = participant.id;
    form.elements.name.value = participant.name;
    form.elements.vorname.value = participant.vorname;
    form.elements.bezahlt.checked = Boolean(participant.bezahlt);
    form.elements.bemerkung.value = participant.bemerkung || "";
    setEditMeal(participant.essensauswahl);
    setEditError("");
    editModal.show();
  };

  const handleEditSubmit = async event => {
    event.preventDefault();
    const form = event.target;
    const existing = participants.find(participant => participant.id === editingId);
    try {
      setEditError("");
      const updated = await updateParticipant({
        id: editingId,
        ...toParticipantPayload({
          name: form.elements.name.value,
          vorname: form.elements.vorname.value,
          essensauswahl: form.elements.essensauswahl.value,
          bezahlt: form.elements.bezahlt.checked,
          bemerkung: form.elements.bemerkung.value,
          mitgliedId: existing?.mitgliedId
        })
      });
      participants = participants.map(participant => participant.id === updated.id ? updated : participant);
      render();
      editModal.hide();
      showToast(`${updated.vorname} ${updated.name} gespeichert.`);
    } catch (error) {
      setEditError(error.message || "Teilnehmer konnte nicht gespeichert werden.");
    }
  };

  const init = () => {
    buildForm();
    gridApi = createGrid("warnemuende", "warnemuendeGrid", getColumns(), {
      // Ohne Blaettern bleiben die Nachruecker am Ende der Liste sichtbar.
      pagination: false,
      rowClassRules: { "warnemuende-nachruecker-row": params => Boolean(params.data?.nachruecker) },
      onRowDoubleClicked: event => openEdit(event.data),
      onCellValueChanged: handleCellValueChanged,
      stopEditingWhenCellsLoseFocus: true
    });
    document.getElementById("warnemuendeForm")?.addEventListener("submit", handleSubmit);
    editModal = editModal || new Modal(document.getElementById("warnemuendeEditModal"));
    document.getElementById("warnemuendeEditForm")?.addEventListener("submit", handleEditSubmit);
    render();
    return gridApi;
  };

  return { init, load };
};
