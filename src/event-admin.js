import { Modal } from "bootstrap";
import { formatIsoDate, retryAsync } from "./member-utils.js";
import { showToast } from "./ui.js";
import { createEventDomain } from "./event-domain.js";
import { buildEventPdf, pdfToBytes } from "./event-pdf.js";

export const createEventAdmin = ({
  createGrid,
  event,
  createParticipant,
  deleteParticipant,
  loadParticipants,
  resolveParticipantPhoto,
  setFallbackPhoto,
  updateParticipant
}) => {
  const { key, maxSeats, mealOptions } = event;
  const { numberParticipants, sortByAnmeldung, summarizeMeals, toParticipantPayload } = createEventDomain(event);
  // Alle Bausteine eines Events haengen am Schluessel: warnemuendeForm, eisbeinessenGrid, ...
  const domId = suffix => `${key}${suffix}`;

  let gridApi = null;
  let participants = [];
  let editModal = null;
  let editingId = null;
  // Nummer und Nachrueckerstatus haengen an der angezeigten Reihenfolge, nicht am Datensatz:
  // deshalb je Zeile gemerkt und bei jeder Sortierung neu vergeben.
  let displayNumbers = new Map();

  const setMessage = (elementId, message) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
  };

  const setError = message => setMessage(domId("Error"), message);
  const setEditError = message => setMessage(domId("EditError"), message);

  const updateSummary = () => {
    const summary = document.getElementById(domId("Summary"));
    if (!summary) return;
    const mitfahrend = participants.filter(participant => !participant.abgesagt);
    const abgesagt = participants.length - mitfahrend.length;
    const nachruecker = [...displayNumbers.values()].filter(entry => entry.nachruecker).length;
    summary.textContent = [
      `${mitfahrend.length} Teilnehmer`,
      ...(abgesagt ? [`${abgesagt} abgesagt`] : []),
      ...(nachruecker ? [`${nachruecker} Nachrücker ab Platz ${maxSeats + 1}`] : []),
      ...(mealOptions.length ? [summarizeMeals(participants)] : []),
      `bezahlt: ${mitfahrend.filter(participant => participant.bezahlt).length}`
    ].join(" · ");
  };

  const renumberDisplayedRows = api => {
    const nodes = [];
    api.forEachNodeAfterFilterAndSort(node => nodes.push(node));
    const numbered = numberParticipants(nodes.map(node => node.data || {}));
    displayNumbers = new Map(nodes.map((node, index) => [node.id, numbered[index]]));
    api.refreshCells({ columns: ["nr"], force: true });
    api.redrawRows();
    updateSummary();
  };

  const rowNumbering = node => displayNumbers.get(node?.id);

  const render = () => {
    gridApi?.setGridOption("rowData", sortByAnmeldung(participants));
    updateSummary();
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
      showToast(`${updated.vorname} ${updated.name} ${updated.abgesagt ? "abgesagt" : "nimmt wieder teil"}.`);
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

  // Druckfassung in Anmeldereihenfolge - unabhaengig davon, wie die Tabelle gerade sortiert ist.
  const exportPdf = () => {
    const pdf = pdfToBytes(buildEventPdf(sortByAnmeldung(participants), { event }));
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${key}-teilnehmerliste-${formatIsoDate(new Date())}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const form = event.target;
    try {
      setError("");
      const created = await createParticipant(toParticipantPayload({
        name: form.elements.name.value,
        vorname: form.elements.vorname.value,
        essensauswahl: form.elements.essensauswahl?.value,
        bemerkung: form.elements.bemerkung.value
      }));
      participants = [...participants, created];
      render();
      form.reset();
      buildForm();
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

  const getMealColumn = () => ({
    headerName: "Essensauswahl",
    field: "essensauswahl",
    editable: false,
    cellClass: "meal-cell",
    minWidth: 260,
    cellRenderer: params => createMealChips(params.value, meal => {
      if (meal !== params.value) params.node.setDataValue("essensauswahl", meal);
    })
  });

  const getColumns = () => [
    getPhotoColumn(),
    getActionColumn(),
    {
      headerName: "Nr.",
      colId: "nr",
      // Reine Platzangabe (voll ab Platz 49): zaehlt die angezeigte Liste von oben
      // nach unten durch und steht deshalb weder in den Daten noch in der Datenbank.
      sortable: false,
      filter: false,
      valueGetter: params => rowNumbering(params.node)?.nr ?? null,
      valueFormatter: params => params.value ?? "",
      pinned: "left",
      width: 88,
      minWidth: 88,
      maxWidth: 88,
      editable: false,
      suppressMovable: true
    },
    { headerName: "Name", field: "name", minWidth: 150 },
    { headerName: "Vorname", field: "vorname", minWidth: 150 },
    ...(mealOptions.length ? [getMealColumn()] : []),
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

  const setFormMeal = meal => setMealField(`#${domId("Form")}`, domId("Essensauswahl"), meal);
  const setEditMeal = meal => setMealField(`#${domId("EditForm")}`, domId("EditEssensauswahl"), meal);

  const buildForm = () => mealOptions.length && setFormMeal(mealOptions[0]);

  const openEdit = participant => {
    const form = document.getElementById(domId("EditForm"));
    if (!form || !editModal) return;
    editingId = participant.id;
    form.elements.name.value = participant.name;
    form.elements.vorname.value = participant.vorname;
    form.elements.bezahlt.checked = Boolean(participant.bezahlt);
    form.elements.abgesagt.checked = Boolean(participant.abgesagt);
    form.elements.bemerkung.value = participant.bemerkung || "";
    if (mealOptions.length) setEditMeal(participant.essensauswahl);
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
          essensauswahl: form.elements.essensauswahl?.value,
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
    gridApi = createGrid(key, domId("Grid"), getColumns(), {
      // Unveraendert uebernehmen: ohne eigene Sortierung wuerde createGrid sonst nach Namen sortieren.
      columnDefs: getColumns(),
      // Ohne Blaettern bleiben die Nachruecker am Ende der Liste sichtbar.
      pagination: false,
      rowClassRules: {
        "event-nachruecker-row": params => Boolean(rowNumbering(params.node)?.nachruecker),
        "event-abgesagt-row": params => Boolean(params.data?.abgesagt)
      },
      onRowDoubleClicked: event => openEdit(event.data),
      onCellValueChanged: handleCellValueChanged,
      onModelUpdated: event => renumberDisplayedRows(event.api),
      stopEditingWhenCellsLoseFocus: true
    });
    document.getElementById(domId("Form"))?.addEventListener("submit", handleSubmit);
    document.getElementById(domId("ExportBtn"))?.addEventListener("click", exportPdf);
    editModal = editModal || new Modal(document.getElementById(domId("EditModal")));
    document.getElementById(domId("EditForm"))?.addEventListener("submit", handleEditSubmit);
    render();
    return gridApi;
  };

  return { init, key, load };
};
