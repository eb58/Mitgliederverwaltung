"use strict";

import { createInitialMembers } from './dummyData.js';

const interestGroupMap = {
  1: "Kreativ",
  2: "Kartenspiel",
  3: "Gymnastik",
  4: "Tischtennis",
  5: "Englisch",
  6: "Schach",
  7: "PC im Alltag",
  8: "PC Anfänger/Fortgeschrittene",
  9: "Excel",
  10: "Smartphone",
  11: "Videogruppe",
  12: "Wandern",
  13: "Fahrradtouren"
};

const austrittsgrundMap = {
  1: "Tod",
  2: "Kein Interesse mehr",
  3: "Wegzug",
  4: "Sonstiges"
};

const christmasChoiceMap = {
  0: "Nein",
  1: "Ja",
  2: "Ja + Gast"
};

const interestGroupOptions = Object.entries(interestGroupMap).map(([value, label]) => ({ value: Number(value), label }));
const austrittsgrundOptions = Object.entries(austrittsgrundMap).map(([value, label]) => ({ value: Number(value), label }));

const fieldDefinitions = [
  { key: "id", label: "ID", type: "number", required: true },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "vorname", label: "Vorname", type: "text", required: true },
  { key: "geschlecht", label: "Geschlecht", type: "radio", options: [{ value: "m", label: "männlich" }, { value: "w", label: "weiblich" }] },
  { key: "passbild", label: "Passbild", type: "text" },
  { key: "strasse", label: "Straße", type: "text" },
  { key: "plz", label: "PLZ", type: "text" },
  { key: "ort", label: "Ort", type: "text" },
  { key: "telefon", label: "Telefon", type: "text" },
  { key: "handy", label: "Handy", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "geburtstag", label: "Geburtstag", type: "date" },
  { key: "eintrittsdatum", label: "Eintrittsdatum", type: "date" },
  { key: "austrittsdatum", label: "Austrittsdatum", type: "date" },
  { key: "austrittsgrund", label: "Austrittsgrund", type: "select", options: austrittsgrundOptions, allowEmpty: true },
  { key: "interessengruppen", label: "Interessengruppen", type: "multiselect", options: interestGroupOptions },
  { key: "gruppenwahl", label: "Gruppenwahl", type: "text" },
  { key: "funktion", label: "Funktion", type: "text" },
  { key: "auswahl", label: "Auswahl", type: "checkbox" },
  { key: "ausweisErteilt", label: "Ausweis erteilt", type: "checkbox" },
  { key: "clubzugehoerigkeit", label: "Clubzugehörigkeit", type: "number" },
  { key: "weihnachtsessen", label: "Weihnachtsessen", type: "select", options: [{ value: 0, label: "Nein" }, { value: 1, label: "Ja" }, { value: 2, label: "Ja + Gast" }] },
  { key: "wnEssenBezahlt", label: "WNessenbezahlt", type: "checkbox" },
  { key: "beitragClubBezahlt", label: "Beitrag Club bezahlt", type: "checkbox" },
  { key: "betragClubBar", label: "Betrag Club bar", type: "currency" },
  { key: "beitragComputerBezahlt", label: "Beitrag Computer bezahlt", type: "checkbox" },
  { key: "betragComputerBar", label: "Beitrag Computer bar", type: "currency" },
  { key: "preisClub", label: "Preis Club", type: "currency" },
  { key: "gezahlterBetragClub", label: "gezahlter Betrag Club", type: "currency" },
  { key: "einzahlungClubAm", label: "Einzahlung Club am", type: "date" },
  { key: "preisComputer", label: "Preis Computer", type: "currency" },
  { key: "gezahlterBetragComputer", label: "gezahlter Betrag Computer", type: "currency" },
  { key: "einzahlungComputerAm", label: "Einzahlung Computer am", type: "date" },
  { key: "preisWeihnachten", label: "Preis Weihnachten", type: "currency" },
  { key: "gezahlterBetragWeihnachten", label: "gezahlter Betrag Weihnachten", type: "currency" },
  { key: "bemerkung", label: "Bemerkung", type: "textarea" },
  { key: "tischnummer", label: "Tischnummer", type: "number" }
];

const formSections = [
  {
    id: "basis",
    label: "Basis",
    fieldKeys: ["name", "vorname", "geschlecht", "geburtstag", "passbild"]
  },
  {
    id: "kontakt",
    label: "Kontakt",
    fieldKeys: ["strasse", "plz", "ort", "telefon", "handy", "email"]
  },
  {
    id: "verein",
    label: "Verein",
    fieldKeys: [
      "eintrittsdatum",
      "austrittsdatum",
      "austrittsgrund",
      "interessengruppen",
      "gruppenwahl",
      "funktion",
      "auswahl",
      "ausweisErteilt",
      "clubzugehoerigkeit"
    ]
  },
  {
    id: "zahlungen",
    label: "Zahlungen",
    fieldKeys: [
      "beitragClubBezahlt",
      "betragClubBar",
      "preisClub",
      "gezahlterBetragClub",
      "einzahlungClubAm",
      "beitragComputerBezahlt",
      "betragComputerBar",
      "preisComputer",
      "gezahlterBetragComputer",
      "einzahlungComputerAm"
    ]
  },
  {
    id: "weihnachten",
    label: "Weihnachten",
    fieldKeys: [
      "weihnachtsessen",
      "wnEssenBezahlt",
      "preisWeihnachten",
      "gezahlterBetragWeihnachten",
      "tischnummer"
    ]
  },
  {
    id: "notizen",
    label: "Notizen",
    fieldKeys: ["bemerkung"]
  }
];

const state = {
  members: [],
  nextId: 1,
  editingId: null
};

const gridApis = {
  overview: null,
  payments: null,
  christmas: null,
  historical: null
};

let ageHistogramChart = null;
let interestGroupChart = null;

const STORAGE_KEY = "vereinsverwaltung.members.v1";

const gridLocaleText = {
  page: "Seite",
  more: "mehr",
  to: "bis",
  of: "von",
  next: "Weiter",
  last: "Letzte",
  first: "Erste",
  previous: "Zurück",
  loadingOoo: "Lade...",
  noRowsToShow: "Keine Mitglieder gefunden",
  selectAll: "Alle auswählen",
  searchOoo: "Suchen...",
  blanks: "Leer",
  filterOoo: "Filtern...",
  equals: "Gleich",
  notEqual: "Ungleich",
  contains: "Enthält",
  notContains: "Enthält nicht",
  startsWith: "Beginnt mit",
  endsWith: "Endet mit",
  lessThan: "Kleiner als",
  greaterThan: "Größer als",
  inRange: "Im Bereich",
  andCondition: "UND",
  orCondition: "ODER",
  applyFilter: "Anwenden",
  resetFilter: "Zurücksetzen",
  clearFilter: "Leeren",
  cancelFilter: "Abbrechen"
};

let memberModal = null;

const initApp = () => {
  state.members = loadStoredMembers() || createInitialMembers(200);
  state.nextId = getNextId(state.members);

  buildMemberForm();
  memberModal = new bootstrap.Modal(document.getElementById("memberModal"));
  initGrids();
  wireUi();
  refreshAllViews();
};

document.addEventListener("DOMContentLoaded", initApp);

const wireUi = () => {
  document.getElementById("addMemberBtn").addEventListener("click", () => openMemberModal(null));
  document.getElementById("memberForm").addEventListener("submit", handleMemberSubmit);
  document.getElementById("globalSearchInput").addEventListener("input", event => applyQuickFilter(event.target.value.trim()));

  document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(tabButton => {
    tabButton.addEventListener("shown.bs.tab", () => {
      setTimeout(() => {
        Object.values(gridApis).forEach(api => {
          if (api && api.sizeColumnsToFit) {
            api.sizeColumnsToFit();
          }
        });
      }, 10);
    });
  });
};

const initGrids = () => {
  gridApis.overview = createGrid("overviewGrid", getOverviewColumns());
  gridApis.payments = createGrid("paymentsGrid", getPaymentColumns());
  gridApis.christmas = createGrid("christmasGrid", getChristmasColumns());
  gridApis.historical = createGrid("historicalGrid", getHistoricalColumns());
};

const createGrid = (containerId, columnDefs) => {
  const gridDiv = document.getElementById(containerId);
  const options = {
    columnDefs,
    rowData: [],
    defaultColDef: {
      sortable: true,
      filter: true,
      floatingFilter: true,
      resizable: true,
      minWidth: 120
    },
    sortModel: [
      { colId: "name", sort: "asc" }
    ],
    pagination: true,
    paginationPageSize: 20,
    rowHeight: 48,
    headerHeight: 44,
    animateRows: true,
    localeText: gridLocaleText,
    getRowId: params => String(params.data.id),
    onRowDoubleClicked: event => openMemberModal(event.data.id)
  };

  return agGrid.createGrid(gridDiv, options);
};

const getOverviewColumns = () => [
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Email", field: "email", minWidth: 220 },
  { headerName: "Handy", field: "handy", minWidth: 150 },
  { headerName: "Geburtstag", field: "geburtstag", valueFormatter: dateFormatter, minWidth: 140 },
  { headerName: "Interessengruppen", field: "interessengruppen", valueFormatter: interestGroupFormatter, minWidth: 220, flex: 1 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getHistoricalColumns = () => [
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Austrittsdatum", field: "austrittsdatum", valueFormatter: dateFormatter, minWidth: 150 },
  { headerName: "Austrittsgrund", field: "austrittsgrund", valueFormatter: params => austrittsgrundMap[Number(params.value)] || "", minWidth: 170 },
  { headerName: "Email", field: "email", minWidth: 220 },
  { headerName: "Handy", field: "handy", minWidth: 150 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getPaymentColumns = () => [
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Beitrag Club bezahlt", field: "beitragClubBezahlt", minWidth: 170, filter: false, cellRenderer: toggleCellRenderer("beitragClubBezahlt") },
  { headerName: "Betrag Club bar", field: "betragClubBar", valueFormatter: currencyFormatter, minWidth: 150 },
  { headerName: "Beitrag Computer bezahlt", field: "beitragComputerBezahlt", minWidth: 190, filter: false, cellRenderer: toggleCellRenderer("beitragComputerBezahlt") },
  { headerName: "Beitrag Computer bar", field: "betragComputerBar", valueFormatter: currencyFormatter, minWidth: 170 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getChristmasColumns = () => [
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Weihnachtsessen", field: "weihnachtsessen", valueFormatter: christmasFormatter, minWidth: 150 },
  { headerName: "WNessenbezahlt", field: "wnEssenBezahlt", minWidth: 145, filter: false, cellRenderer: toggleCellRenderer("wnEssenBezahlt") },
  { headerName: "Preis Weihnachten", field: "preisWeihnachten", valueFormatter: currencyFormatter, minWidth: 150 },
  { headerName: "gezahlter Betrag Weihnachten", field: "gezahlterBetragWeihnachten", valueFormatter: currencyFormatter, minWidth: 210 },
  { headerName: "Tischnummer", field: "tischnummer", minWidth: 120 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getEditColumn = () => ({
  headerName: "",
  field: "id",
  pinned: "left",
  width: 68,
  minWidth: 68,
  maxWidth: 68,
  cellClass: "edit-cell",
  headerClass: "edit-header",
  sortable: false,
  filter: false,
  suppressMovable: true,
  cellRenderer: params => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edit-icon-btn";
    button.title = "Mitglied bearbeiten";
    button.setAttribute("aria-label", "Mitglied bearbeiten");
    button.innerHTML = `
      <svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M4 20h4.8L19.1 9.7l-4.8-4.8L4 15.2V20z"></path>
        <path d="M15.7 3.5l4.8 4.8"></path>
      </svg>
    `;
    button.addEventListener("click", () => openMemberModal(params.data.id));
    return button;
  }
});

const toggleCellRenderer = fieldName => params => {
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "form-check-input table-toggle";
  toggle.checked = asBoolean(params.value);
  toggle.title = "Status umschalten";

  toggle.addEventListener("change", () => {
    params.data[fieldName] = toggle.checked;
    params.node.setDataValue(fieldName, toggle.checked);
    persistMembers();
    refreshDashboard();
    refreshAllGridCells();
  });
  return toggle;
};

const buildMemberForm = () => {
  const container = document.getElementById("formFields");
  container.innerHTML = "";

  const hiddenIdInput = document.createElement("input");
  hiddenIdInput.type = "hidden";
  hiddenIdInput.id = "field-id";
  hiddenIdInput.dataset.fieldKey = "id";

  const fieldByKey = new Map(fieldDefinitions.map(field => [field.key, field]));
  const tabs = document.createElement("ul");
  tabs.className = "nav nav-pills member-form-tabs";
  tabs.id = "memberFormTabs";
  tabs.role = "tablist";

  const tabContent = document.createElement("div");
  tabContent.className = "tab-content member-form-tab-content";
  tabContent.id = "memberFormTabContent";

  formSections.forEach((section, index) => {
    const isActive = index === 0;
    const tabId = `member-form-${section.id}-tab`;
    const paneId = `member-form-${section.id}-pane`;

    const tabItem = document.createElement("li");
    tabItem.className = "nav-item";
    tabItem.role = "presentation";

    const tabButton = document.createElement("button");
    tabButton.className = `nav-link${isActive ? " active" : ""}`;
    tabButton.id = tabId;
    tabButton.type = "button";
    tabButton.role = "tab";
    tabButton.dataset.bsToggle = "tab";
    tabButton.dataset.bsTarget = `#${paneId}`;
    tabButton.setAttribute("aria-controls", paneId);
    tabButton.setAttribute("aria-selected", String(isActive));
    tabButton.textContent = section.label;

    const pane = document.createElement("div");
    pane.className = `tab-pane fade${isActive ? " show active" : ""}`;
    pane.id = paneId;
    pane.role = "tabpanel";
    pane.setAttribute("aria-labelledby", tabId);
    pane.tabIndex = 0;

    const row = document.createElement("div");
    row.className = "row g-3";

    section.fieldKeys.forEach(fieldKey => {
      const field = fieldByKey.get(fieldKey);
      if (field) {
        row.appendChild(createMemberFormField(field));
      }
    });

    tabItem.appendChild(tabButton);
    tabs.appendChild(tabItem);
    pane.appendChild(row);
    tabContent.appendChild(pane);
  });

  container.append(hiddenIdInput, tabs, tabContent);
};

const createMemberFormField = field => {
  const col = document.createElement("div");
  if (field.type === "textarea") {
    col.className = "col-12 member-form-field";
  } else if (field.type === "checkbox") {
    col.className = "col-sm-6 col-lg-4 member-form-field";
  } else if (field.type === "radio") {
    col.className = "col-sm-6 member-form-field";
  } else {
    col.className = "col-md-6 member-form-field";
  }

  if (field.type === "checkbox") {
    const wrap = document.createElement("div");
    wrap.className = "form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input";
    input.id = `field-${field.key}`;
    input.dataset.fieldKey = field.key;

    const label = document.createElement("label");
    label.className = "form-check-label";
    label.setAttribute("for", input.id);
    label.textContent = field.label;

    wrap.append(input, label);
    col.appendChild(wrap);
    return col;
  }

  const label = document.createElement("label");
  label.className = "form-label";
  label.setAttribute("for", `field-${field.key}`);
  label.textContent = field.label;

  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = 4;
    input.className = "form-control";
  } else if (field.type === "radio") {
    input = document.createElement("div");
    input.className = "radio-group";
    field.options.forEach(option => {
      const wrap = document.createElement("div");
      wrap.className = "form-check form-check-inline";

      const radioInput = document.createElement("input");
      radioInput.type = "radio";
      radioInput.className = "form-check-input";
      radioInput.name = `field-${field.key}`;
      radioInput.value = String(option.value);
      radioInput.id = `field-${field.key}-${option.value}`;
      radioInput.dataset.fieldKey = field.key;

      const radioLabel = document.createElement("label");
      radioLabel.className = "form-check-label";
      radioLabel.setAttribute("for", radioInput.id);
      radioLabel.textContent = option.label;

      wrap.append(radioInput, radioLabel);
      input.appendChild(wrap);
    });
  } else if (field.type === "select") {
    input = document.createElement("select");
    input.className = "form-select";
    if (field.allowEmpty) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "-";
      input.appendChild(empty);
    }
    field.options.forEach(option => {
      const el = document.createElement("option");
      el.value = String(option.value);
      el.textContent = option.label;
      input.appendChild(el);
    });
  } else if (field.type === "multiselect") {
    input = document.createElement("select");
    input.className = "form-select";
    input.multiple = true;
    input.size = Math.min(6, field.options.length);
    field.options.forEach(option => {
      const el = document.createElement("option");
      el.value = String(option.value);
      el.textContent = option.label;
      input.appendChild(el);
    });
  } else {
    input = document.createElement("input");
    input.className = "form-control";
    input.type = field.type === "currency" ? "number" : field.type;
    if (field.type === "currency") {
      input.step = "0.01";
      input.min = "0";
    }
  }

  input.id = `field-${field.key}`;
  input.dataset.fieldKey = field.key;
  if (field.required) {
    input.required = true;
  }

  col.append(label, input);
  return col;
};

const openMemberModal = memberId => {
  const isNew = memberId === null || memberId === undefined;
  const modalTitle = document.getElementById("memberModalLabel");
  modalTitle.textContent = isNew ? "Neues Mitglied anlegen" : "Mitglied bearbeiten";

  const member = isNew ? createEmptyMember() : cloneMember(findMemberById(memberId));
  if (!member) {
    return;
  }

  state.editingId = isNew ? null : member.id;
  fillMemberForm(member, isNew);
  resetMemberFormTabs();
  memberModal.show();
};

const resetMemberFormTabs = () => {
  const firstTab = document.querySelector("#memberFormTabs .nav-link");
  if (firstTab && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(firstTab).show();
  }
};

const fillMemberForm = (member, isNew) => {
  fieldDefinitions.forEach(field => {
    const input = document.getElementById(`field-${field.key}`);
    if (!input) {
      return;
    }

    const raw = member[field.key];

    if (field.type === "checkbox") {
      input.checked = asBoolean(raw);
      return;
    }

    if (field.type === "multiselect") {
      const values = new Set((raw || []).map(value => String(value)));
      Array.from(input.options).forEach(option => {
        option.selected = values.has(option.value);
      });
      return;
    }

    if (field.type === "date") {
      input.value = raw || "";
      return;
    }

    if (field.type === "currency") {
      input.value = raw === null || raw === undefined ? "" : String(raw);
      return;
    }

    if (field.type === "select") {
      input.value = raw === null || raw === undefined ? "" : String(raw);
      return;
    }

    if (field.type === "radio") {
      const radioValue = raw === null || raw === undefined ? "" : String(raw);
      const radioInput = document.querySelector(`input[name="field-${field.key}"][value="${radioValue}"]`);
      if (radioInput) {
        radioInput.checked = true;
      }
      return;
    }

    input.value = raw === null || raw === undefined ? "" : String(raw);
  });

  const idInput = document.getElementById("field-id");
  if (idInput) {
    if (isNew) {
      idInput.value = String(state.nextId);
    }
    idInput.readOnly = !isNew;
  }
};

const handleMemberSubmit = event => {
  event.preventDefault();

  const formData = readMemberFromForm();
  if (!formData.name || !formData.vorname) {
    window.alert("Name und Vorname sind Pflichtfelder.");
    return;
  }

  if (state.editingId === null) {
    if (state.members.some(member => member.id === formData.id)) {
      window.alert(`Die ID ${formData.id} existiert bereits. Bitte eine andere ID wählen.`);
      return;
    }
    state.members.push(formData);
    state.nextId = Math.max(state.nextId, formData.id + 1);
  } else {
    const index = state.members.findIndex(member => member.id === state.editingId);
    if (index < 0) {
      window.alert("Der Datensatz wurde nicht gefunden.");
      return;
    }
    formData.id = state.editingId;
    state.members[index] = formData;
  }

  state.members.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "de");
    if (byName !== 0) {
      return byName;
    }
    return a.vorname.localeCompare(b.vorname, "de");
  });

  persistMembers();
  memberModal.hide();
  refreshAllViews();
};

const readMemberFromForm = () => {
  const member = {};

  fieldDefinitions.forEach(field => {
    const input = document.getElementById(`field-${field.key}`);
    if (!input) {
      return;
    }

    if (field.type === "checkbox") {
      member[field.key] = input.checked;
      return;
    }

    if (field.type === "multiselect") {
      member[field.key] = Array.from(input.selectedOptions).map(option => Number(option.value));
      return;
    }

    if (field.type === "date") {
      member[field.key] = input.value || "";
      return;
    }

    if (field.type === "number") {
      member[field.key] = input.value === "" ? 0 : Number(input.value);
      return;
    }

    if (field.type === "currency") {
      member[field.key] = input.value === "" ? 0 : roundCurrency(Number(input.value));
      return;
    }

    if (field.type === "select") {
      if (input.value === "") {
        member[field.key] = null;
      } else if (field.key === "weihnachtsessen" || field.key === "austrittsgrund") {
        member[field.key] = Number(input.value);
      } else {
        member[field.key] = input.value;
      }
      return;
    }

    if (field.type === "radio") {
      const checkedRadio = document.querySelector(`input[name="field-${field.key}"]:checked`);
      member[field.key] = checkedRadio ? checkedRadio.value : "";
      return;
    }

    member[field.key] = (input.value || "").trim();
  });

  return normalizeMember(member);
};

const isActiveMember = member => !member.austrittsdatum && !member.austrittsgrund;

const refreshAllViews = () => {
  const activeMembers = [...state.members]
    .filter(isActiveMember)
    .sort((a, b) => {
      const nameA = String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" });
      if (nameA !== 0) return nameA;
      return String(a.vorname || "").localeCompare(String(b.vorname || ""), "de", { sensitivity: "base" });
    });

  setGridData(gridApis.overview, activeMembers);
  setGridData(gridApis.payments, activeMembers);
  setGridData(gridApis.christmas, activeMembers);

  const historicalMembers = [...state.members]
    .filter(member => !isActiveMember(member))
    .sort((a, b) => {
      const nameA = String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" });
      if (nameA !== 0) return nameA;
      return String(a.vorname || "").localeCompare(String(b.vorname || ""), "de", { sensitivity: "base" });
    });
  setGridData(gridApis.historical, historicalMembers);

  refreshDashboard();

  const quickFilter = document.getElementById("globalSearchInput").value.trim();
  if (quickFilter) {
    applyQuickFilter(quickFilter);
  }

  Object.values(gridApis).forEach(api => {
    if (api && api.sizeColumnsToFit) {
      api.sizeColumnsToFit();
    }
  });
};

const setGridData = (api, rowData) => {
  if (!api) return;
  if (api.setGridOption) return api.setGridOption("rowData", rowData);
  api.setRowData?.(rowData);
};

const applyQuickFilter = text => {
  Object.values(gridApis).forEach(api => {
    if (!api) return;
    api.setGridOption ? api.setGridOption("quickFilterText", text) : api.setQuickFilter?.(text);
  });
};

const refreshAllGridCells = () => Object.values(gridApis).forEach(api => api?.refreshCells?.({ force: true }));

const refreshDashboard = () => {
  const activeMembers = state.members.filter(isActiveMember);
  const total = state.members.length;
  const active = activeMembers.length;
  const clubPaid = activeMembers.filter(member => asBoolean(member.beitragClubBezahlt)).length;
  const computerPaid = activeMembers.filter(member => asBoolean(member.beitragComputerBezahlt)).length;

  setText("metricTotal", String(total));
  setText("metricActive", String(active));
  setText("metricClubPaid", `${clubPaid} (${percent(clubPaid, total)}%)`);
  setText("metricComputerPaid", `${computerPaid} (${percent(computerPaid, total)}%)`);

  const clubOpen = total - clubPaid;
  const computerOpen = total - computerPaid;

  setText("metricClubOpen", `${clubOpen} (${percent(clubOpen, total)}%)`);
  setText("metricComputerOpen", `${computerOpen} (${percent(computerOpen, total)}%)`);

  const genderCounts = {
    m: 0,
    w: 0,
    unknown: 0
  };
  const ages = [];
  const ageBuckets = [
    { label: "55-64", min: 55, max: 64, count: 0 },
    { label: "65-74", min: 65, max: 74, count: 0 },
    { label: "75-84", min: 75, max: 84, count: 0 },
    { label: "85-94", min: 85, max: 94, count: 0 },
    { label: "95+", min: 95, max: Infinity, count: 0 }
  ];
  const today = new Date();

  activeMembers.forEach(member => {
    const genderKey = String(member.geschlecht || "").toLowerCase();
    if (genderKey === "m" || genderKey === "w") {
      genderCounts[genderKey] += 1;
    } else {
      genderCounts.unknown += 1;
    }

    const age = calculateAge(member.geburtstag, today);
    if (age !== null) {
      ages.push(age);
      if (age >= 55) {
        const bucket = ageBuckets.find(bucket => age >= bucket.min && age <= bucket.max);
        if (bucket) {
          bucket.count += 1;
        }
      }
    }
  });

  const averageAge = ages.length ? Math.round((ages.reduce((sum, value) => sum + value, 0) / ages.length) * 10) / 10 : null;

  setText("metricAverageAge", averageAge === null ? "-" : `${averageAge} Jahre`);
  setText("metricMaleCount", `${genderCounts.m} (${percent(genderCounts.m, total)}%)`);
  setText("metricFemaleCount", `${genderCounts.w} (${percent(genderCounts.w, total)}%)`);
  renderAgeChart(ageBuckets, total);

  const groupCounts = {};
  Object.keys(interestGroupMap).forEach(id => {
    groupCounts[id] = 0;
  });
  activeMembers.forEach(member => {
    (member.interessengruppen || []).forEach(groupId => {
      if (!(groupId in groupCounts)) {
        groupCounts[groupId] = 0;
      }
      groupCounts[groupId] += 1;
    });
  });

  const groupRows = Object.keys(groupCounts)
    .map(id => ({ id: Number(id), label: interestGroupMap[id] || `Gruppe ${id}`, count: groupCounts[id] }))
    .filter(item => item.count > 0)
    .slice(0, Object.keys(interestGroupMap).length);
  renderInterestGroupChart(groupRows, total);

  const inactive = total - active;
};

const renderAgeChart = (buckets, total) => {
  const canvas = document.getElementById("ageChart");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  ageHistogramChart?.destroy();
  ageHistogramChart = null;
  const labels = buckets.map(bucket => bucket.label);
  const data = buckets.map(bucket => bucket.count);
  const colors = buckets.map((_, index) => index % 2 === 0 ? "rgba(15, 118, 110, 0.85)" : "rgba(44, 160, 151, 0.85)");
  ageHistogramChart = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Mitglieder", data, backgroundColor: colors, borderColor: colors.map(color => color.replace(/0\.85\)$/, "1)")), borderWidth: 1, borderRadius: 12, borderSkipped: false, maxBarThickness: 36 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      layout: { padding: { top: 10, right: 6, bottom: 4, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => {
              const value = context.parsed.y;
              return `${value} Mitglieder (${percent(value, total)}%)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#46535c", font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } },
        y: { beginAtZero: true, grid: { color: "rgba(15, 118, 110, 0.08)", borderDash: [3, 3] }, ticks: { color: "#46535c", precision: 0, font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } }
      }
    }
  });
};

const renderInterestGroupChart = (groups, total) => {
  const canvas = document.getElementById("groupChart");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  interestGroupChart?.destroy();
  interestGroupChart = null;
  const labels = groups.map(item => item.label);
  const data = groups.map(item => item.count);
  const backgroundColor = labels.map((_, index) => index % 2 === 0 ? "rgba(22, 101, 84, 0.85)" : "rgba(43, 154, 124, 0.8)");
  const borderColor = backgroundColor.map(color => color.replace(/0\.8?5\)$/, "1)"))
  interestGroupChart = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Mitglieder", data, backgroundColor, borderColor, borderWidth: 1, borderRadius: 12, borderSkipped: false, maxBarThickness: 26 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      layout: { padding: { top: 10, right: 6, bottom: 4, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => {
              const value = context.parsed.x;
              return `${value} Mitglieder (${percent(value, total)}%)`;
            }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: "rgba(15, 118, 110, 0.08)", borderDash: [3, 3] }, ticks: { color: "#46535c", precision: 0, font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } },
        y: { grid: { display: false }, ticks: { color: "#46535c", font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } }
      }
    }
  });
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const findMemberById = id => state.members.find(member => member.id === id);

const createEmptyMember = () => {
  const member = {};
  fieldDefinitions.forEach(field => {
    if (field.type === "checkbox") {
      member[field.key] = false;
    } else if (field.type === "multiselect") {
      member[field.key] = [];
    } else if (field.type === "number" || field.type === "currency") {
      member[field.key] = field.key === "id" ? state.nextId : 0;
    } else if (field.type === "select") {
      member[field.key] = field.key === "geschlecht" ? "w" : null;
    } else {
      member[field.key] = "";
    }
  });
  return member;
};

const dateFormatter = params => formatDateDE(params.value);
const currencyFormatter = params => formatCurrency(params.value);
const interestGroupFormatter = params => formatInterestGroups(params.value);
const christmasFormatter = params => christmasChoiceMap[Number(params.value)] || christmasChoiceMap[0];

const formatInterestGroups = groupIds => !groupIds || groupIds.length === 0 ? "" : groupIds.map(id => interestGroupMap[id] || `ID ${id}`).join(", ");

const formatDateDE = isoDate => {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.split("-");
  return parts.length !== 3 ? isoDate : `${parts[2]}.${parts[1]}.${parts[0]}`;
};

const formatCurrency = value => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return Number(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
};

const parseLegacyDate = value => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/[./]/).map(part => part.trim()).filter(Boolean);
  if (parts.length !== 3) return "";
  let [day, month, year] = parts.map(Number);
  if (year < 100) year += 1900;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return "";
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parseLegacyCurrency = value => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return roundCurrency(value);
  const normalized = String(value).replace(/\s/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
};

const asBoolean = value => {
  if (value === true || value === 1 || value === -1) return true;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return ["true", "1", "-1", "yes"].includes(lower);
  }
  return false;
};

const calculateAge = (isoDate, today = new Date()) => {
  if (!isoDate || typeof isoDate !== "string") return null;
  const parts = isoDate.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const ensureMinimumAge = (isoDate, minAge = 55, today = new Date()) => {
  const normalized = parseLegacyDate(isoDate);
  if (!normalized) return isoDate;
  const parts = normalized.split("-");
  if (parts.length !== 3) return normalized;
  const [year, month, day] = parts.map(Number);
  if (![year, month, day].every(Number.isFinite)) return normalized;
  const birthDate = new Date(year, month - 1, day);
  const minBirthday = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
  return birthDate <= minBirthday ? normalized : `${minBirthday.getFullYear()}-${String(minBirthday.getMonth() + 1).padStart(2, "0")}-${String(minBirthday.getDate()).padStart(2, "0")}`;
};

const percent = (value, total) => total ? Math.round((value / total) * 100) : 0;
const roundCurrency = value => Math.round(Number(value) * 100) / 100;

const loadStoredMembers = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.map(normalizeMember);
  } catch (error) {
    console.warn("Gespeicherte Mitgliederdaten konnten nicht gelesen werden.", error);
    return null;
  }
};

const persistMembers = () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.members));
  } catch (error) {
    console.warn("Mitgliederdaten konnten nicht gespeichert werden.", error);
  }
};

const normalizeMember = raw => {
  const clone = { ...raw };

  clone.id = Number(clone.id);
  clone.name = (clone.name || "").trim();
  clone.vorname = (clone.vorname || "").trim();
  clone.geschlecht = clone.geschlecht || "w";
  clone.passbild = clone.passbild || "";
  clone.strasse = clone.strasse || "";
  clone.plz = clone.plz || "";
  clone.ort = clone.ort || "Berlin";
  clone.telefon = clone.telefon || "";
  clone.handy = clone.handy || "";
  clone.email = clone.email || "";

  clone.geburtstag = parseLegacyDate(clone.geburtstag);
  clone.geburtstag = ensureMinimumAge(clone.geburtstag);
  clone.eintrittsdatum = parseLegacyDate(clone.eintrittsdatum);
  clone.austrittsdatum = parseLegacyDate(clone.austrittsdatum);

  clone.austrittsgrund = clone.austrittsgrund === null || clone.austrittsgrund === undefined || clone.austrittsgrund === ""
    ? null
    : Number(clone.austrittsgrund);
  clone.interessengruppen = Array.isArray(clone.interessengruppen)
    ? clone.interessengruppen.map(value => Number(value)).filter(value => Number.isFinite(value))
    : [];
  clone.gruppenwahl = clone.gruppenwahl || "";
  clone.funktion = clone.funktion || "";

  clone.auswahl = asBoolean(clone.auswahl);
  clone.ausweisErteilt = asBoolean(clone.ausweisErteilt);
  clone.clubzugehoerigkeit = Number(clone.clubzugehoerigkeit) || 0;
  clone.weihnachtsessen = Number(clone.weihnachtsessen) || 0;
  clone.wnEssenBezahlt = asBoolean(clone.wnEssenBezahlt);
  clone.beitragClubBezahlt = asBoolean(clone.beitragClubBezahlt);
  clone.betragClubBar = parseLegacyCurrency(clone.betragClubBar);
  clone.beitragComputerBezahlt = asBoolean(clone.beitragComputerBezahlt);
  clone.betragComputerBar = parseLegacyCurrency(clone.betragComputerBar);
  clone.preisClub = parseLegacyCurrency(clone.preisClub);
  clone.gezahlterBetragClub = parseLegacyCurrency(clone.gezahlterBetragClub);
  clone.einzahlungClubAm = parseLegacyDate(clone.einzahlungClubAm);
  clone.preisComputer = parseLegacyCurrency(clone.preisComputer);
  clone.gezahlterBetragComputer = parseLegacyCurrency(clone.gezahlterBetragComputer);
  clone.einzahlungComputerAm = parseLegacyDate(clone.einzahlungComputerAm);
  clone.preisWeihnachten = parseLegacyCurrency(clone.preisWeihnachten);
  clone.gezahlterBetragWeihnachten = parseLegacyCurrency(clone.gezahlterBetragWeihnachten);
  clone.bemerkung = clone.bemerkung || "";
  clone.tischnummer = Number(clone.tischnummer) || 0;

  return clone;
}

const cloneMember = member => !member ? null : JSON.parse(JSON.stringify(member));
const getNextId = members => members.reduce((max, member) => Math.max(max, member.id), 0) + 1;
