import { Modal } from "bootstrap";
import { retryAsync } from "./member-utils.js";
import { showToast } from "./ui.js";
import { MAX_SEATS, mealOptions, numberParticipants, summarizeMeals, toParticipantPayload } from "./warnemuende-domain.js";

export const createWarnemuendeAdmin = ({
  createGrid,
  createParticipant,
  deleteParticipant,
  loadParticipants,
  resolveParticipantPhoto,
  setFallbackPhoto,
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
    const mitfahrend = participants.filter(participant => !participant.abgesagt);
    const abgesagt = participants.length - mitfahrend.length;
    const nachruecker = rows.filter(row => row.nachruecker).length;
    if (summary) summary.textContent = [
      `${mitfahrend.length} Teilnehmer`,
      ...(abgesagt ? [`${abgesagt} abgesagt`] : []),
      ...(nachruecker ? [`${nachruecker} Nachrücker ab Platz ${MAX_SEATS + 1}`] : []),
      summarizeMeals(participants),
      `bezahlt: ${mitfahrend.filter(participant => participant.bezahlt).length}`
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

  const toggleCancelled = async participant => {
    try {
      setError("");
      const updated = await updateParticipant({
        id: participant.id,
        ...toParticipantPayload({ ...participant, abgesagt: !participant.abgesagt })
      });
      participants = participants.map(entry => entry.id === updated.id ? updated : entry);
      render();
      showToast(`${updated.vorname} ${updated.name} ${updated.abgesagt ? "abgesagt" : "fährt wieder mit"}.`);
    } catch (error) {
      setError(error.message || "Absage konnte nicht gespeichert werden.");
    }
  };

  const handleDelete = async participant => {
    if (!confirm(`${participant.vorname} ${participant.name} endgültig aus der Liste löschen? Für eine Absage bitte abbrechen und den Absage-Schalter benutzen.`)) return;
    try {
      setError("");
      await deleteParticipant(participant.id);
      participants = participants.filter(entry => entry.id !== participant.id);
      render();
      showToast(`${participant.vorname} ${participant.name} gelöscht.`);
    } catch (error) {
      setError(error.message || "Teilnehmer konnte nicht gelöscht werden.");
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

  const createRowActionButton = (title, iconMarkup, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edit-icon-btn";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = iconMarkup;
    button.addEventListener("click", onClick);
    return button;
  };

  const EDIT_ICON = `
    <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 20h4.8L19.1 9.7l-4.8-4.8L4 15.2V20z"></path>
      <path d="M15.7 3.5l4.8 4.8"></path>
    </svg>
  `;
  const CANCEL_ICON = `
    <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="9"></circle>
      <line x1="6" y1="18" x2="18" y2="6"></line>
    </svg>
  `;
  const UNDO_ICON = `
    <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <polyline points="9 14 4 14 4 19"></polyline>
      <path d="M4 14a8 8 0 1 0 2.3-5.7"></path>
    </svg>
  `;
  const DELETE_ICON = `
    <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M5 7h14"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M6 7l1 13h10l1-13"></path>
      <path d="M9 7V4h6v3"></path>
    </svg>
  `;

  const getPhotoColumn = () => ({
    headerName: "",
    colId: "passbild",
    pinned: "left",
    width: 64,
    minWidth: 64,
    maxWidth: 64,
    cellClass: "photo-cell",
    headerClass: "photo-header",
    editable: false,
    sortable: false,
    filter: false,
    suppressMovable: true,
    cellRenderer: params => {
      const wrapper = document.createElement("div");
      setFallbackPhoto(wrapper);
      const name = `${params.data?.vorname || ""} ${params.data?.name || ""}`.trim();

      resolveParticipantPhoto(params.data?.mitgliedId).then(photoDataUrl => {
        if (!photoDataUrl) return;
        const image = document.createElement("img");
        image.className = "member-photo__image";
        image.alt = `Passfoto von ${name}`;
        image.loading = "lazy";
        image.addEventListener("error", () => setFallbackPhoto(wrapper), { once: true });
        wrapper.className = "member-photo";
        wrapper.title = image.alt;
        wrapper.setAttribute("aria-label", image.alt);
        wrapper.replaceChildren(image);
        image.src = photoDataUrl;
      }).catch(() => {
        // Platzhalter bleibt stehen.
      });

      return wrapper;
    }
  });

  const getActionColumn = () => ({
    headerName: "",
    colId: "aktionen",
    pinned: "left",
    width: 148,
    minWidth: 148,
    maxWidth: 148,
    cellClass: "edit-cell",
    headerClass: "edit-header",
    editable: false,
    sortable: false,
    filter: false,
    suppressMovable: true,
    cellRenderer: params => {
      const cancelled = Boolean(params.data?.abgesagt);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.append(
        createRowActionButton("Teilnehmer bearbeiten", EDIT_ICON, () => openEdit(params.data)),
        createRowActionButton(
          cancelled ? "Absage zurücknehmen" : "Teilnehmer absagen",
          cancelled ? UNDO_ICON : CANCEL_ICON,
          () => toggleCancelled(params.data)
        ),
        createRowActionButton("Teilnehmer löschen", DELETE_ICON, () => handleDelete(params.data))
      );
      return actions;
    }
  });

  const getColumns = () => [
    getPhotoColumn(),
    getActionColumn(),
    {
      headerName: "Nr.",
      field: "nr",
      sort: "asc",
      valueFormatter: params => params.value ?? "",
      // Abgesagte haben keine Nummer, sollen aber an ihrem Platz in der Anmeldereihenfolge bleiben.
      comparator: (valueA, valueB, nodeA, nodeB) => (nodeA.data?.position || 0) - (nodeB.data?.position || 0),
      pinned: "left",
      width: 88,
      minWidth: 88,
      maxWidth: 88,
      editable: false,
      filter: false,
      suppressMovable: true
    },
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
    { headerName: "Bemerkung", field: "bemerkung", minWidth: 180, flex: 1 }
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
    form.elements.abgesagt.checked = Boolean(participant.abgesagt);
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
          abgesagt: form.elements.abgesagt.checked,
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
      rowClassRules: {
        "warnemuende-nachruecker-row": params => Boolean(params.data?.nachruecker),
        "warnemuende-abgesagt-row": params => Boolean(params.data?.abgesagt)
      },
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
