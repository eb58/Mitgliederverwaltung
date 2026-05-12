"use strict";

const interestGroups = [
  { id: 1, label: "Allgemein" },
  { id: 2, label: "Gymnastik" },
  { id: 3, label: "Kreativ" },
  { id: 4, label: "Computer" },
  { id: 5, label: "Kartenspiel" },
  { id: 6, label: "Englisch" },
  { id: 7, label: "Zeitlosen" },
  { id: 8, label: "Tischtennis 1" },
  { id: 9, label: "Schach" },
  { id: 10, label: "Smartphone Apple" },
  { id: 11, label: "Laufgruppe" },
  { id: 15, label: "Tischtennis 2" },
  { id: 16, label: "Excel" },
  { id: 17, label: "WinSoft" },
  { id: 18, label: "Smartphone Android" },
  { id: 19, label: "Video" },
  { id: 20, label: "Publisher" },
  { id: 21, label: "PC im Alltag" },
  { id: 22, label: "Grundlagen" },
  { id: 23, label: "Senioren-Skat" },
  { id: 24, label: "Gesprächskreis Aktuelles" },
  { id: 26, label: "Tischtennis 3" }
];

const germanCollator = new Intl.Collator("de", { sensitivity: "base", numeric: true });
const interestGroupMap = Object.fromEntries(interestGroups.map(group => [group.id, group.label]));

const seniorenclubsMap = [
  { id: 1, name: "FZST Heiligensee" },
  { id: 2, name: "FZST Tegel" },
  { id: 3, name: "FZST Hermsdorf" },
  { id: 4, name: "FZST Schäfersee" },
  { id: 5, name: "FZST Märkischer Seniorentreff" },
  { id: 6, name: "FZST Club der Lebensfrohen" },
  { id: 7, name: "FZST Adelheidallee" },
  { id: 8, name: "Gäste" },
  { id: 9, name: "Lübars" }
];

const austrittsgrundMap = {
  1: "",
  2: "Tod",
  3: "Kündigung",
  4: "Umzug",
  5: "Altenheim",
  6: "anderer Club",
  7: "ohne",
  8: "Gesundheit"
};

const christmasChoiceMap = {
  0: "Nein",
  1: "Ja",
  2: "Ja + Gast"
};

const MEMBER_CLUB_ID = 9;

const funktionsMap = {
  1: "Vorstand",
  2: "Kassierer",
  3: "Gruppenleiter",
  4: "Gruppenleiter stellv.",
  5: "Ersthelfer",
  6: "Brandschutzbeauftragter",
  7: "Rote Karte"
};


const interestGroupOptions = [...interestGroups]
  .sort((a, b) => germanCollator.compare(a.label, b.label))
  .map(group => ({ value: group.id, label: group.label }));
const austrittsgrundOptions = Object.entries(austrittsgrundMap)
  .filter(([, label]) => label)
  .map(([value, label]) => ({ value: Number(value), label }));
const funktionsOptions = Object.entries(funktionsMap).map(([value, label]) => ({ value: Number(value), label }));
const seniorenclubOptions = seniorenclubsMap
  .filter(club => club.id !== null)
  .map(club => ({ value: club.id, label: club.adresse ? `${club.name} (${club.adresse})` : club.name }));

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
  { key: "funktion", label: "Funktion", type: "multiselect", options: funktionsOptions, valueType: "textList" },
  { key: "auswahl", label: "Auswahl", type: "checkbox" },
  { key: "ausweisErteilt", label: "Ausweis erteilt", type: "checkbox" },
  { key: "clubzugehoerigkeit", label: "Clubzugehörigkeit", type: "select", options: seniorenclubOptions, allowEmpty: true, valueType: "number" },
  { key: "weihnachtsessen", label: "Weihnachtsessen", type: "select", options: [{ value: 0, label: "Nein" }, { value: 1, label: "Ja" }, { value: 2, label: "Ja + Gast" }] },
  { key: "wnEssenBezahlt", label: "bezahlt", type: "checkbox" },
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
    fieldKeys: ["name", "vorname", "geschlecht", "geburtstag"]
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

const CONFIG_FILE_NAME = "config.json";
const STORAGE_FILE_NAME = "members.json";
const CSV_STORAGE_FILE_NAME = "members.csv";
const SAVE_DEBOUNCE_MS = 450;
const searchableTabTargets = new Set([
  "#overview-pane",
  "#payments-pane",
  "#christmas-pane",
  "#historical-pane"
]);
const gridApiByTabTarget = {
  "#overview-pane": "overview",
  "#payments-pane": "payments",
  "#christmas-pane": "christmas",
  "#historical-pane": "historical"
};

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

const csvHeaderAliases = new Map([
  ["zuname", "name"],
  ["eintritt", "eintrittsdatum"],
  ["austritt", "austrittsdatum"],
  ["wnessenbezahlt", "wnEssenBezahlt"],
  ["bezahlt", "wnEssenBezahlt"],
  ["email", "email"],
  ["e-mail", "email"],
  ["strasse", "strasse"],
  ["straße", "strasse"]
]);

const computerGroupPatterns = [
  "computer",
  "excel",
  "grundlagen",
  "pc",
  "publisher",
  "smartphone",
  "video",
  "winsoft"
];

let memberModal = null;
let storageFilePathPromise = null;
let persistTimerId = null;
let persistQueue = Promise.resolve();
const photoPathCache = {
  passbilderDirectoryPathPromise: null,
  photoFileNamesPromise: null
};

const initApp = async () => {
  const loadedMembers = await loadStoredMembers();
  state.members = loadedMembers || [];
  state.nextId = getNextId(state.members);

  buildMemberForm();
  memberModal = new bootstrap.Modal(document.getElementById("memberModal"));
  initGrids();
  wireUi();
  refreshAllViews();
};

document.addEventListener("DOMContentLoaded", () => {
  initApp().catch(error => {
    console.error("Initialisierung fehlgeschlagen.", error);
    state.members = [];
    state.nextId = getNextId(state.members);
    buildMemberForm();
    memberModal = new bootstrap.Modal(document.getElementById("memberModal"));
    initGrids();
    wireUi();
    refreshAllViews();
  });
});

const wireUi = () => {
  document.getElementById("addMemberBtn").addEventListener("click", () => openMemberModal(null));
  document.getElementById("memberForm").addEventListener("submit", handleMemberSubmit);
  document.getElementById("globalSearchInput").addEventListener("input", event => applyQuickFilter(event.target.value.trim()));
  updateGlobalSearchVisibility();

  document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(tabButton => {
    tabButton.addEventListener("shown.bs.tab", event => {
      updateGlobalSearchVisibility(event.target.dataset.bsTarget);
      setTimeout(() => {
        Object.values(gridApis).forEach(api => {
          if (api && api.sizeColumnsToFit) {
            api.sizeColumnsToFit();
          }
        });
      }, 10);
    });
  });

  window.addEventListener("beforeunload", () => {
    persistMembersImmediate(true).catch(() => {
      // no-op
    });
  });
};

const updateGlobalSearchVisibility = activeTarget => {
  const searchInput = document.getElementById("globalSearchInput");
  const target = activeTarget || document.querySelector("#mainTabs .nav-link.active")?.dataset.bsTarget;
  const isSearchable = searchableTabTargets.has(target);

  searchInput.hidden = !isSearchable;
  if (isSearchable) {
    applyQuickFilter(searchInput.value.trim());
  } else {
    searchInput.blur();
    Object.values(gridApis).forEach(api => setGridQuickFilter(api, ""));
  }
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
    paginationPageSize: 50,
    rowHeight: 48,
    headerHeight: 44,
    animateRows: true,
    localeText: gridLocaleText,
    getRowId: params => String(params.data.id),
    rowClassRules: {
      "guest-row": params => isGuestMember(params.data)
    },
    onRowDoubleClicked: event => openMemberModal(event.data.id)
  };

  return agGrid.createGrid(gridDiv, options);
};

const getOverviewColumns = () => [
  getPhotoColumn(),
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Email", field: "email", minWidth: 220 },
  { headerName: "Handy", field: "handy", minWidth: 150 },
  { headerName: "Geburtstag", field: "geburtstag", valueFormatter: dateFormatter, minWidth: 140 },
  { headerName: "Interessengruppen", field: "interessengruppen", valueFormatter: interestGroupFormatter, minWidth: 220, flex: 1 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getPhotoColumn = () => ({
  headerName: "",
  field: "passbild",
  pinned: "left",
  width: 64,
  minWidth: 64,
  maxWidth: 64,
  cellClass: "photo-cell",
  headerClass: "photo-header",
  sortable: false,
  filter: false,
  suppressMovable: true,
  cellRenderer: params => {
    const wrapper = document.createElement("div");
    wrapper.className = "member-photo member-photo--fallback";
    wrapper.title = "Kein Passfoto vorhanden";
    wrapper.setAttribute("aria-label", "Kein Passfoto vorhanden");
    wrapper.innerHTML = `
      <svg class="member-photo__fallback-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M20 21a8 8 0 0 0-16 0"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    `;

    resolveMemberPhotoDataUrl(params.data).then(photoDataUrl => {
      if (!photoDataUrl) return;

      const image = document.createElement("img");
      image.className = "member-photo__image";
      image.alt = `Passfoto von ${formatMemberName(params.data)}`;
      image.loading = "lazy";
      image.addEventListener("error", () => setFallbackPhoto(wrapper), { once: true });
      wrapper.className = "member-photo";
      wrapper.title = image.alt;
      wrapper.setAttribute("aria-label", image.alt);
      wrapper.replaceChildren(image);
      image.src = photoDataUrl;
    }).catch(() => {
      // Fallback remains visible.
    });

    return wrapper;
  }
});

const setFallbackPhoto = wrapper => {
  wrapper.className = "member-photo member-photo--fallback";
  wrapper.title = "Kein Passfoto vorhanden";
  wrapper.setAttribute("aria-label", "Kein Passfoto vorhanden");
  wrapper.innerHTML = `
    <svg class="member-photo__fallback-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M20 21a8 8 0 0 0-16 0"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  `;
};

const getHistoricalColumns = () => [
  getPhotoColumn(),
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
  getPhotoColumn(),
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
  getPhotoColumn(),
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Weihnachtsessen", field: "weihnachtsessen", valueFormatter: christmasFormatter, minWidth: 150 },
  { headerName: "bezahlt", field: "wnEssenBezahlt", minWidth: 145, filter: false, cellRenderer: toggleCellRenderer("wnEssenBezahlt") },
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

    if (section.id === "basis") {
      pane.appendChild(createMemberPhotoPreview());
    }

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
      wrap.className = "form-check d-inline-block me-3";

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

  if (["name", "vorname"].includes(field.key)) {
    input.addEventListener("input", () => updateMemberPhotoPreview(readMemberPreviewFromForm()));
  }

  col.append(label, input);
  return col;
};

const createMemberPhotoPreview = () => {
  const preview = document.createElement("div");
  preview.className = "member-photo-preview";
  preview.id = "memberPhotoPreview";

  const photo = document.createElement("div");
  photo.className = "member-photo-preview__image member-photo member-photo--fallback";
  photo.id = "memberPhotoPreviewImage";
  setFallbackPhoto(photo);
  photo.classList.add("member-photo-preview__image");

  const text = document.createElement("div");
  text.className = "member-photo-preview__text";

  const title = document.createElement("div");
  title.className = "member-photo-preview__title";
  title.textContent = "Passbild";

  const fileName = document.createElement("div");
  fileName.className = "member-photo-preview__file";
  fileName.id = "memberPhotoPreviewFile";
  fileName.textContent = "Kein Passfoto vorhanden";

  text.append(title, fileName);
  preview.append(photo, text);
  return preview;
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
      const rawValues = Array.isArray(raw) ? raw : String(raw || "").split(/[|,;]/).map(value => value.trim()).filter(Boolean);
      const values = new Set(rawValues.map(value => String(value)));
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

  updateMemberPhotoPreview(member);

  const idInput = document.getElementById("field-id");
  if (idInput) {
    if (isNew) {
      idInput.value = String(state.nextId);
    }
    idInput.readOnly = !isNew;
  }
};

const updateMemberPhotoPreview = member => {
  const previewImage = document.getElementById("memberPhotoPreviewImage");
  const previewFile = document.getElementById("memberPhotoPreviewFile");
  if (!previewImage || !previewFile) return;

  setFallbackPhoto(previewImage);
  previewImage.className = "member-photo-preview__image member-photo member-photo--fallback";
  previewFile.textContent = "Kein Passfoto vorhanden";

  resolveMemberPhotoDataUrl(member).then(photoDataUrl => {
    if (!photoDataUrl) return;

    const image = document.createElement("img");
    image.className = "member-photo__image";
    image.alt = `Passfoto von ${formatMemberName(member)}`;
    image.addEventListener("error", () => {
      setFallbackPhoto(previewImage);
      previewImage.classList.add("member-photo-preview__image");
      previewFile.textContent = "Kein Passfoto vorhanden";
    }, { once: true });

    previewImage.className = "member-photo-preview__image member-photo";
    previewImage.title = image.alt;
    previewImage.setAttribute("aria-label", image.alt);
    previewImage.replaceChildren(image);
    previewFile.textContent = normalizePhotoFileName(member.passbild) || "Automatisch gefunden";
    image.src = photoDataUrl;
  }).catch(() => {
    // Fallback remains visible.
  });
};

const readMemberPreviewFromForm = () => ({
  name: document.getElementById("field-name")?.value || "",
  vorname: document.getElementById("field-vorname")?.value || "",
  passbild: ""
});

const handleMemberSubmit = async event => {
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
    formData.passbild = state.members[index].passbild || "";
    state.members[index] = formData;
  }

  state.members.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "de");
    if (byName !== 0) {
      return byName;
    }
    return a.vorname.localeCompare(b.vorname, "de");
  });
  await persistMembersImmediate(false);
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
      const values = Array.from(input.selectedOptions).map(option => option.value);
      member[field.key] = field.valueType === "textList" ? values.join("; ") : values.map(value => Number(value));
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

const hasExitReason = member => Boolean(austrittsgrundMap[Number(member.austrittsgrund)]);
const isActiveMember = member => !member.austrittsdatum && !hasExitReason(member);
const isGuestMember = member => Number(member?.clubzugehoerigkeit) !== MEMBER_CLUB_ID;
const normalizeGroupText = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const isComputerGroupMember = member => computerGroupPatterns.some(pattern => normalizeGroupText(member?.gruppenwahl).includes(pattern));

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

  applyQuickFilter(document.getElementById("globalSearchInput").value.trim());

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
  clearInactiveQuickFilters();
  setGridQuickFilter(getActiveGridApi(), text);
};

const getActiveTabTarget = () => document.querySelector("#mainTabs .nav-link.active")?.dataset.bsTarget;

const getActiveGridApi = () => {
  const gridKey = gridApiByTabTarget[getActiveTabTarget()];
  return gridKey ? gridApis[gridKey] : null;
};

const setGridQuickFilter = (api, text) => {
  if (!api) return;
  api.setGridOption ? api.setGridOption("quickFilterText", text) : api.setQuickFilter?.(text);
};

const clearInactiveQuickFilters = () => {
  const activeApi = getActiveGridApi();
  Object.values(gridApis).forEach(api => {
    if (api && api !== activeApi) {
      setGridQuickFilter(api, "");
    }
  });
};

const refreshAllGridCells = () => Object.values(gridApis).forEach(api => api?.refreshCells?.({ force: true }));

const refreshDashboard = () => {
  const activeMembers = state.members.filter(isActiveMember);
  const clubMembers = activeMembers.filter(member => !isGuestMember(member));
  const total = clubMembers.length;
  const guests = activeMembers.filter(isGuestMember).length;
  const clubPaid = clubMembers.filter(member => asBoolean(member.beitragClubBezahlt)).length;
  const computerMembers = clubMembers.filter(isComputerGroupMember);
  const computerTotal = computerMembers.length;
  const computerPaid = computerMembers.filter(member => asBoolean(member.beitragComputerBezahlt)).length;

  setText("metricTotal", String(total));
  setText("metricGuestCount", String(guests));
  setText("metricClubPaid", `${clubPaid} (${percent(clubPaid, total)}%)`);
  setText("metricComputerTotal", String(computerTotal));
  setText("metricComputerPaid", `${computerPaid} (${percent(computerPaid, computerTotal)}%)`);

  const clubOpen = total - clubPaid;
  const computerOpen = computerTotal - computerPaid;

  setText("metricClubOpen", `${clubOpen} (${percent(clubOpen, total)}%)`);
  setText("metricComputerOpen", `${computerOpen} (${percent(computerOpen, computerTotal)}%)`);

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

  clubMembers.forEach(member => {
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
  clubMembers.forEach(member => {
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
    .sort((a, b) => germanCollator.compare(a.label, b.label))
    .slice(0, Object.keys(interestGroupMap).length);
  renderInterestGroupChart(groupRows, total);
  renderBirthdayList(clubMembers, today);
};

const renderBirthdayList = (members, today = new Date()) => {
  const container = document.getElementById("birthdayList");
  if (!container) return;

  const birthdays = members
    .map(member => getUpcomingBirthday(member, today))
    .filter(Boolean)
    .sort((a, b) => a.daysUntil - b.daysUntil || String(a.member.name || "").localeCompare(String(b.member.name || ""), "de", { sensitivity: "base" }))
    .slice(0, 12);

  container.innerHTML = "";
  if (birthdays.length === 0) {
    const empty = document.createElement("div");
    empty.className = "birthday-empty";
    empty.textContent = "Keine Geburtstage in den nächsten 7 Tagen";
    container.appendChild(empty);
    return;
  }

  birthdays.forEach(item => {
    const row = document.createElement("div");
    row.className = "birthday-row";
    row.tabIndex = 0;
    row.role = "button";
    row.title = `${formatMemberName(item.member)} öffnen`;
    row.addEventListener("click", () => openMemberModal(item.member.id));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMemberModal(item.member.id);
      }
    });

    const photo = document.createElement("div");
    photo.className = "birthday-photo member-photo member-photo--fallback";
    setFallbackPhoto(photo);
    photo.classList.add("birthday-photo");
    resolveMemberPhotoDataUrl(item.member).then(photoDataUrl => {
      if (!photoDataUrl) return;

      const image = document.createElement("img");
      image.className = "member-photo__image";
      image.alt = `Passfoto von ${formatMemberName(item.member)}`;
      image.addEventListener("error", () => {
        setFallbackPhoto(photo);
        photo.classList.add("birthday-photo");
      }, { once: true });
      photo.className = "birthday-photo member-photo";
      photo.title = image.alt;
      photo.setAttribute("aria-label", image.alt);
      photo.replaceChildren(image);
      image.src = photoDataUrl;
    }).catch(() => {
      // Fallback remains visible.
    });

    const person = document.createElement("div");
    person.className = "birthday-person";
    person.textContent = `${item.member.vorname || ""} ${item.member.name || ""}`.trim();

    const details = document.createElement("div");
    details.className = "birthday-details";
    details.textContent = `${formatDateDE(item.isoDate)} · wird ${item.age}`;

    const badge = document.createElement("div");
    badge.className = "birthday-badge";
    badge.textContent = item.daysUntil === 0 ? "Heute" : `in ${item.daysUntil} T.`;

    const text = document.createElement("div");
    text.append(person, details);
    row.append(photo, text, badge);
    container.appendChild(row);
  });
};

const getUpcomingBirthday = (member, today = new Date()) => {
  if (!member.geburtstag || typeof member.geburtstag !== "string") return null;
  const parts = member.geburtstag.split("-");
  if (parts.length !== 3) return null;

  const [birthYear, month, day] = parts.map(Number);
  if (![birthYear, month, day].every(Number.isFinite)) return null;

  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const birthdayThisYear = new Date(start.getFullYear(), month - 1, day);
  const birthday = birthdayThisYear < start ? new Date(start.getFullYear() + 1, month - 1, day) : birthdayThisYear;
  const daysUntil = Math.round((birthday - start) / 86400000);
  if (daysUntil < 0 || daysUntil > 7) return null;

  return {
    member,
    daysUntil,
    age: birthday.getFullYear() - birthYear,
    isoDate: `${birthday.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  };
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
  const chartContainer = canvas.parentElement;
  if (chartContainer) {
    chartContainer.style.minHeight = `${Math.min(360, Math.max(280, groups.length * 20))}px`;
  }
  interestGroupChart?.destroy();
  interestGroupChart = null;
  const labels = groups.map(item => item.label);
  const data = groups.map(item => item.count);
  const backgroundColor = labels.map((_, index) => index % 2 === 0 ? "rgba(22, 101, 84, 0.85)" : "rgba(43, 154, 124, 0.8)");
  const borderColor = backgroundColor.map(color => color.replace(/0\.8?5\)$/, "1)"))
  interestGroupChart = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Mitglieder", data, backgroundColor, borderColor, borderWidth: 1, borderRadius: 8, borderSkipped: false, maxBarThickness: 18 }] },
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
        y: { grid: { display: false }, ticks: { autoSkip: false, color: "#46535c", font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } }
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
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
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

const formatMemberName = member => `${member?.vorname || ""} ${member?.name || ""}`.trim() || "Mitglied";

const resolveMemberPhotoDataUrl = async member => {
  const bridge = getElectronBridge();
  if (!bridge) return null;

  if (bridge.photos && typeof bridge.photos.findDataUrl === "function") {
    return bridge.photos.findDataUrl(await getStorageFilePath(), getMemberPhotoFileNames(member));
  }

  const photoPath = await resolveMemberPhotoPath(member);
  if (!photoPath) return null;
  if (typeof bridge.fs.readFileBase64 !== "function") {
    return filePathToFileUrl(photoPath);
  }

  const base64 = await bridge.fs.readFileBase64(photoPath);
  return `data:${getImageMimeType(photoPath)};base64,${base64}`;
};

const resolveMemberPhotoPath = async member => {
  const bridge = getElectronBridge();
  if (!bridge) return null;

  const fileNames = getMemberPhotoFileNames(member);
  if (fileNames.length === 0) return null;

  const passbilderDirectoryPath = await getPassbilderDirectoryPath();
  const matchedFileName = await findExistingPhotoFileName(fileNames);
  if (matchedFileName) {
    return bridge.path.join(passbilderDirectoryPath, matchedFileName);
  }

  for (const fileName of fileNames) {
    const photoPath = isAbsoluteFilePath(fileName)
      ? fileName
      : await bridge.path.join(passbilderDirectoryPath, fileName);
    if (await bridge.fs.existsSync(photoPath)) return photoPath;
  }

  return null;
};

const getMemberPhotoFileNames = member => {
  const configuredFile = normalizePhotoFileName(member?.passbild);
  const name = String(member?.name || "").trim();
  const vorname = String(member?.vorname || "").trim();
  const fallbackBaseNames = [
    `${name} ${vorname}`.trim(),
    `${vorname} ${name}`.trim()
  ].filter(Boolean);
  const fallbackFiles = fallbackBaseNames.flatMap(baseName => [".jpg", ".jpeg", ".png"].map(extension => `${baseName}${extension}`));

  return [...new Set([configuredFile, ...fallbackFiles].filter(Boolean))];
};

const findExistingPhotoFileName = async fileNames => {
  const availableFileNames = await getAvailablePhotoFileNames();
  if (availableFileNames.length === 0) return null;

  const fileNameByLowerName = new Map(availableFileNames.map(fileName => [fileName.toLowerCase(), fileName]));
  return fileNames.map(fileName => fileNameByLowerName.get(fileName.toLowerCase())).find(Boolean) || null;
};

const getAvailablePhotoFileNames = async () => {
  if (photoPathCache.photoFileNamesPromise) {
    return photoPathCache.photoFileNamesPromise;
  }

  const bridge = getElectronBridge();
  if (!bridge || typeof bridge.fs.readDir !== "function") return [];

  photoPathCache.photoFileNamesPromise = (async () => {
    const passbilderDirectoryPath = await getPassbilderDirectoryPath();
    const fileNames = await bridge.fs.readDir(passbilderDirectoryPath);
    return fileNames.filter(fileName => /\.(jpe?g|png)$/i.test(fileName));
  })();

  return photoPathCache.photoFileNamesPromise;
};

const getPassbilderDirectoryPath = async () => {
  if (photoPathCache.passbilderDirectoryPathPromise) {
    return photoPathCache.passbilderDirectoryPathPromise;
  }

  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error("Electron bridge nicht verfuegbar.");
  }

  photoPathCache.passbilderDirectoryPathPromise = (async () => {
    const storageFilePath = await getStorageFilePath();
    const storageDirectory = await bridge.path.dirname(storageFilePath);
    return bridge.path.join(storageDirectory, "Passbilder");
  })();

  return photoPathCache.passbilderDirectoryPathPromise;
};

const isAbsoluteFilePath = filePath => /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\");

const normalizePhotoFileName = value => {
  const fileName = String(value || "").trim().split(/[\\/]/).filter(Boolean).pop() || "";
  return /\.(jpe?g|png)$/i.test(fileName) ? fileName : "";
};

const filePathToFileUrl = filePath => {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  if (normalized.startsWith("//")) {
    return `file:${normalized.split("/").map(encodeURIComponent).join("/")}`;
  }

  const parts = normalized.split("/");
  const encoded = parts
    .map((part, index) => index === 0 && /^[a-zA-Z]:$/.test(part) ? part : encodeURIComponent(part))
    .join("/");
  return `file:///${encoded}`;
};

const getImageMimeType = filePath => {
  const extension = String(filePath || "").split(".").pop().toLowerCase();
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png"
  };
  return mimeTypes[extension] || "image/jpeg";
};

const getElectronBridge = () => {
  const bridge = window.electron;
  if (!bridge || !bridge.fs || !bridge.path || typeof bridge.getUserDataPath !== "function" || typeof bridge.getPortableDataPath !== "function") {
    return null;
  }
  return bridge;
};

const getStorageFilePath = async () => {
  if (storageFilePathPromise) {
    return storageFilePathPromise;
  }

  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error("Electron bridge nicht verfuegbar.");
  }

  storageFilePathPromise = (async () => {
    const config = await readStorageConfig(bridge);
    return config.membersFilePath;
  })();

  return storageFilePathPromise;
};

const getDefaultStorageConfig = async bridge => {
  const portableDataPath = await bridge.getPortableDataPath();
  const membersFilePath = await bridge.path.join(portableDataPath, STORAGE_FILE_NAME);
  return { membersFilePath };
};

const getLegacyStorageFilePath = async bridge => {
  const userDataPath = await bridge.getUserDataPath();
  return bridge.path.join(userDataPath, STORAGE_FILE_NAME);
};

const normalizeComparableFilePath = filePath => String(filePath || "").replace(/\//g, "\\").toLowerCase();

const getStorageConfigPath = async bridge => {
  const userDataPath = await bridge.getUserDataPath();
  return bridge.path.join(userDataPath, CONFIG_FILE_NAME);
};

const writeStorageConfig = async (bridge, configPath, config) => {
  await bridge.fs.writeFile(configPath, JSON.stringify(config, null, 2));
};

const readStorageConfig = async bridge => {
  const configPath = await getStorageConfigPath(bridge);
  const defaultConfig = await getDefaultStorageConfig(bridge);
  const exists = await bridge.fs.existsSync(configPath);

  if (!exists) {
    await writeStorageConfig(bridge, configPath, defaultConfig);
    return defaultConfig;
  }

  try {
    const raw = await bridge.fs.readFile(configPath);
    const text = String(raw || "").replace(/^\uFEFF/, "");
    const parsed = text.trim() ? JSON.parse(text) : {};
    const legacyMembersFilePath = await getLegacyStorageFilePath(bridge);
    const membersFilePath = typeof parsed.membersFilePath === "string" && parsed.membersFilePath.trim()
      ? parsed.membersFilePath.trim()
      : defaultConfig.membersFilePath;

    if (normalizeComparableFilePath(membersFilePath) === normalizeComparableFilePath(legacyMembersFilePath)) {
      await writeStorageConfig(bridge, configPath, defaultConfig);
      return defaultConfig;
    }

    return { ...defaultConfig, ...parsed, membersFilePath };
  } catch (error) {
    console.warn("Konfiguration konnte nicht gelesen werden. Standardpfad wird verwendet.", error);
    await writeStorageConfig(bridge, configPath, defaultConfig);
    return defaultConfig;
  }
};

const ensureStorageFile = async () => {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error("Electron bridge nicht verfuegbar.");
  }

  if (typeof bridge.migratePortableData === "function") {
    try {
      await bridge.migratePortableData();
    } catch (error) {
      console.warn("Portable Datenmigration konnte nicht ausgefuehrt werden.", error);
    }
  }

  const storageFilePath = await getStorageFilePath();
  const exists = await bridge.fs.existsSync(storageFilePath);
  if (!exists) {
    const imported = await importMembersFromCsv(bridge, storageFilePath);
    if (imported) {
      return storageFilePath;
    }

    await bridge.fs.writeFile(storageFilePath, JSON.stringify({ members: [] }, null, 2));
  }

  return storageFilePath;
};

const importMembersFromCsv = async (bridge, storageFilePath) => {
  const csvFilePath = await bridge.path.join(await bridge.path.dirname(storageFilePath), CSV_STORAGE_FILE_NAME);
  const exists = await bridge.fs.existsSync(csvFilePath);
  if (!exists) {
    return false;
  }

  const raw = await bridge.fs.readFile(csvFilePath);
  const members = parseMembersCsv(raw);
  if (members.length === 0) {
    return false;
  }

  await bridge.fs.writeFile(storageFilePath, JSON.stringify({
    importedAt: new Date().toISOString(),
    sourceFile: csvFilePath,
    members
  }, null, 2));
  return true;
};

const parseMembersCsv = raw => {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const rows = parseCsvRows(text, delimiter).filter(row => row.some(value => String(value).trim()));

  if (rows.length === 0) {
    return [];
  }

  const headerRowIndex = findCsvHeaderRowIndex(rows);
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex].map(resolveCsvHeaderKey) : fieldDefinitions.map(field => field.key);
  const dataRows = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : rows;

  return dataRows
    .map((row, index) => createMemberFromCsvRow(headers, row, index + 1))
    .map(normalizeMember);
};

const findCsvHeaderRowIndex = rows => rows.findIndex(row => {
  const headers = row.map(resolveCsvHeaderKey);
  const filledColumns = row.filter(value => String(value).trim()).length;
  return headers.filter(Boolean).length >= Math.min(3, filledColumns);
});

const detectCsvDelimiter = text => {
  const sample = text.split(/\r?\n/).find(line => line.trim()) || "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map(delimiter => ({ delimiter, count: countUnquotedDelimiter(sample, delimiter) }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
};

const countUnquotedDelimiter = (line, delimiter) => {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
};

const parseCsvRows = (text, delimiter) => {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      row.push(value);
      value = "";
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
    } else {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows;
};

const normalizeCsvHeader = value => String(value || "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9-]/g, "")
  .toLowerCase();

const resolveCsvHeaderKey = header => {
  const normalized = normalizeCsvHeader(header);
  const directField = fieldDefinitions.find(field => normalizeCsvHeader(field.key) === normalized);
  if (directField) {
    return directField.key;
  }

  const labelField = fieldDefinitions.find(field => normalizeCsvHeader(field.label) === normalized);
  return labelField?.key || csvHeaderAliases.get(normalized) || null;
};

const createMemberFromCsvRow = (headers, row, fallbackId) => {
  const member = {};
  headers.forEach((key, index) => {
    if (key) {
      member[key] = row[index] === undefined ? "" : String(row[index]).trim();
    }
  });

  if (!Number.isFinite(Number(member.id)) || Number(member.id) <= 0) {
    member.id = fallbackId;
  }

  if (typeof member.interessengruppen === "string") {
    member.interessengruppen = member.interessengruppen
      .split(/[|,;]/)
      .map(value => value.trim())
      .filter(Boolean);
  }

  return member;
};

const readStorageDocument = async () => {
  const bridge = getElectronBridge();
  const storageFilePath = await ensureStorageFile();
  const raw = await bridge.fs.readFile(storageFilePath);
  const text = String(raw || "").replace(/^\uFEFF/, "");

  if (!text.trim()) {
    return { members: [] };
  }

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return { members: parsed };
  }
  if (parsed && Array.isArray(parsed.members)) {
    if (await shouldRepairCsvImport(bridge, parsed, storageFilePath)) {
      await importMembersFromCsv(bridge, storageFilePath);
      const repairedRaw = await bridge.fs.readFile(storageFilePath);
      return JSON.parse(repairedRaw);
    }

    return parsed;
  }
  return { members: [] };
};

const shouldRepairCsvImport = async (bridge, data, storageFilePath) => {
  if (!Array.isArray(data.members) || data.members.length === 0) {
    return false;
  }

  const fallbackCsvFilePath = await bridge.path.join(await bridge.path.dirname(storageFilePath), CSV_STORAGE_FILE_NAME);
  const csvFilePath = data.sourceFile || fallbackCsvFilePath;
  const hasCsv = await bridge.fs.existsSync(csvFilePath);
  if (!hasCsv) {
    return false;
  }

  const namedMembers = data.members.filter(member => String(member.name || "").trim() || String(member.vorname || "").trim());
  return namedMembers.length === 0;
};

const loadStoredMembers = async () => {
  try {
    const data = await readStorageDocument();
    if (!Array.isArray(data.members) || data.members.length === 0) {
      return null;
    }
    return data.members.map(normalizeMember);
  } catch (error) {
    console.warn("Gespeicherte Mitgliederdaten konnten nicht gelesen werden.", error);
    return null;
  }
};

const persistMembers = () => {
  if (persistTimerId) {
    clearTimeout(persistTimerId);
  }

  persistTimerId = setTimeout(() => {
    persistTimerId = null;
    persistQueue = persistQueue
      .then(() => persistMembersImmediate(true))
      .catch(error => {
        console.warn("Mitgliederdaten konnten nicht gespeichert werden.", error);
      });
  }, SAVE_DEBOUNCE_MS);
};

const persistMembersImmediate = async (silent = false) => {
  try {
    const bridge = getElectronBridge();
    if (!bridge) {
      throw new Error("Electron bridge nicht verfuegbar.");
    }

    if (persistTimerId) {
      clearTimeout(persistTimerId);
      persistTimerId = null;
    }

    const storageFilePath = await ensureStorageFile();
    const payload = {
      updatedAt: new Date().toISOString(),
      members: state.members
    };
    await bridge.fs.writeFile(storageFilePath, JSON.stringify(payload, null, 2));
    return true;
  } catch (error) {
    if (!silent) {
      window.alert("Speichern auf Dateisystem fehlgeschlagen.");
    }
    throw error;
  }
};

const normalizeMember = raw => {
  const clone = { ...raw };

  const numericId = Number(clone.id);
  clone.id = Number.isFinite(numericId) && numericId > 0 ? numericId : 0;
  clone.name = (clone.name || "").trim();
  clone.vorname = (clone.vorname || "").trim();
  clone.geschlecht = clone.geschlecht || "w";
  clone.passbild = normalizePhotoFileName(clone.passbild);
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
