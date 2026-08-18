"use strict";

import "bootstrap/dist/css/bootstrap.min.css";
import { Tab } from "bootstrap";
import { AllCommunityModule, ModuleRegistry, createGrid as createAgGrid } from "ag-grid-community";
import "./styles.css";
import { createAuth } from "./auth.js";
import {
  asBoolean,
  calculateAge,
  formatCurrency,
  formatDateDE,
  formatIsoDate,
  getBirthDateRangeForAgeBucket,
  getNextId,
  normalizeGroupText
} from "./member-utils.js";
import { createMemberApi } from "./member-api.js";
import { createMemberForm } from "./member-form.js";
import { createMemberHistory } from "./member-history.js";
import { createReferenceAdmin } from "./reference-admin.js";
import { createDashboard } from "./dashboard.js";
import { GRID_COLUMN_STATE_PREFIX, createGridTheme, gridApiByTabTarget, gridLocaleText, searchableTabTargets } from "./grid-config.js";
import {
  austrittsgrundMap,
  funktionsMap,
  germanCollator
} from "./member-config.js";
import {
  christmasFormatter,
  compareIsoDateToFilterDate,
  currencyFormatter,
  dateFormatter,
  formatInterestGroups,
  formatMemberName,
  getMemberFunctionIds,
  interestGroupFormatter,
  isActiveMember,
  isComputerGroupMember,
  isGuestMember,
  isOpenClubPaymentMember
} from "./member-domain.js";
import { gridApis, state } from "./state.js";
import { createUserAdmin } from "./user-admin.js";

ModuleRegistry.registerModules([AllCommunityModule]);

const restoringGridStateKeys = new Set();

const {
  changeOwnPassword: changeOwnPasswordViaApi,
  clearMemberPhotoCache,
  createMember: createMemberViaApi,
  createReferenceItem: createReferenceItemViaApi,
  createUser: createUserViaApi,
  deactivateUser: deactivateUserViaApi,
  deleteReferenceItem: deleteReferenceItemViaApi,
  fetchMemberPhotoObjectUrl,
  invalidateMemberPhotoCache,
  loadMemberChanges: loadMemberChangesViaApi,
  loadMembers: loadMembersFromApi,
  loadRecentMemberChanges: loadRecentMemberChangesViaApi,
  loadReferenceData: loadReferenceDataFromApi,
  loadReferenceItems: loadReferenceItemsFromApi,
  loadUsers: loadUsersFromApi,
  request: requestMemberApi,
  updateMember: updateMemberViaApi,
  updateReferenceItem: updateReferenceItemViaApi,
  updateUser: updateUserViaApi,
  uploadMemberPhoto: uploadMemberPhotoViaApi
} = createMemberApi({
  getAuthToken: () => state.authToken,
  onSessionExpired: () => auth.handleSessionExpired()
});

const userAdmin = createUserAdmin({
  createUser: createUserViaApi,
  deactivateUser: deactivateUserViaApi,
  loadUsers: loadUsersFromApi,
  updateUser: updateUserViaApi
});

const referenceAdmin = createReferenceAdmin({
  createItem: createReferenceItemViaApi,
  deleteItem: deleteReferenceItemViaApi,
  loadAll: loadReferenceDataFromApi,
  loadItems: loadReferenceItemsFromApi,
  onReferenceDataChanged: () => {
    memberForm.build();
    refreshAllViews();
  },
  updateItem: updateReferenceItemViaApi
});

const auth = createAuth({
  changeOwnPassword: changeOwnPasswordViaApi,
  clearMemberPhotoCache,
  loadMembers: loadMembersFromApi,
  refreshAllViews: () => refreshAllViews(),
  request: requestMemberApi,
  setAppShellVisible: visible => setAppShellVisible(visible),
  updateUserVisibility: () => userAdmin.updateVisibility()
});

const {
  loadMemberChangeHistory,
  refreshRecentChanges,
  renderMemberHistory,
  renderRecentChanges
} = createMemberHistory({
  loadMemberChanges: loadMemberChangesViaApi,
  loadRecentChanges: loadRecentMemberChangesViaApi,
  openMemberModal: memberId => memberForm.open(memberId)
});

const memberForm = createMemberForm({
  createMember: createMemberViaApi,
  invalidateMemberPhotoCache,
  loadMemberChangeHistory,
  refreshAllViews: () => refreshAllViews(),
  refreshRecentChanges,
  renderMemberHistory,
  resolveMemberPhotoDataUrl: member => resolveMemberPhotoDataUrl(member),
  setFallbackPhoto: wrapper => setFallbackPhoto(wrapper),
  updateMember: updateMemberViaApi,
  uploadMemberPhoto: uploadMemberPhotoViaApi
});

const {
  downloadRoundBirthdayList,
  refresh: refreshDashboard
} = createDashboard({
  openMemberModal: memberId => memberForm.open(memberId),
  resolveMemberPhotoDataUrl: member => resolveMemberPhotoDataUrl(member),
  setFallbackPhoto: wrapper => setFallbackPhoto(wrapper),
  showOverviewForAgeBucket: bucket => showOverviewForAgeBucket(bucket),
  showOverviewForInterestGroup: group => showOverviewForInterestGroup(group)
});

const initApp = async () => {
  setAppShellVisible(false);
  auth.init();
  await auth.ensureAuthenticated();
  const [, loadedMembers] = await Promise.all([referenceAdmin.load(), loadStoredMembers()]);
  state.members = loadedMembers || [];
  state.nextId = getNextId(state.members);

  memberForm.init();
  userAdmin.init();
  referenceAdmin.init();
  initGrids();
  wireUi();
  refreshAllViews();
  setAppShellVisible(true);
};

document.addEventListener("DOMContentLoaded", () => {
  initApp().catch(error => {
    console.error("Initialisierung fehlgeschlagen.", error);
    state.members = [];
    state.nextId = getNextId(state.members);
    auth.init();
    memberForm.init();
    userAdmin.init();
    referenceAdmin.init();
    initGrids();
    wireUi();
    refreshAllViews();
    renderRecentChanges([], { message: "\u00c4nderungen konnten nicht geladen werden." });
  });
});

const setAppShellVisible = visible => {
  const shell = document.getElementById("appShell");
  if (shell) {
    shell.hidden = !visible;
  }
  userAdmin.updateVisibility();
};

const wireUi = () => {
  document.getElementById("addMemberBtn").addEventListener("click", () => memberForm.open(null));
  document.getElementById("logoutBtn").addEventListener("click", auth.logout);
  document.getElementById("changePasswordBtn").addEventListener("click", auth.openPasswordChange);
  document.getElementById("metricTotalBtn").addEventListener("click", () => showOverviewWithFilter(null));
  document.getElementById("metricGuestCountBtn").addEventListener("click", showGuestOverview);
  document.getElementById("metricClubOpenBtn").addEventListener("click", showOpenClubPayments);
  document.getElementById("togglePaymentComputerGroupsBtn").addEventListener("click", togglePaymentComputerGroups);
  document.getElementById("togglePaymentClubOpenBtn").addEventListener("click", togglePaymentClubOpen);
  document.getElementById("downloadMembersBtn").addEventListener("click", downloadMembers);
  document.getElementById("downloadOpenPaymentsBtn").addEventListener("click", downloadOpenClubPayments);
  document.getElementById("downloadRoundBirthdayBtn").addEventListener("click", downloadRoundBirthdayList);
  document.getElementById("refreshRecentChangesBtn").addEventListener("click", () => refreshRecentChanges({ force: true }));
  document.getElementById("globalSearchInput").addEventListener("input", event => applyQuickFilter(event.target.value.trim()));
  document.getElementById("clearAllFiltersBtn").addEventListener("click", clearAllFilters);
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  updateGlobalSearchVisibility();

  document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(tabButton => {
    tabButton.addEventListener("shown.bs.tab", event => {
      updateGlobalSearchVisibility(event.target.dataset.bsTarget);
      if (event.target.dataset.bsTarget === "#changes-pane") {
        refreshRecentChanges({ force: true });
      }
      setTimeout(() => {
        Object.entries(gridApis).forEach(([gridKey, api]) => fitGridColumnsIfNeeded(gridKey, api));
      }, 10);
    });
  });

  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const isMobileLayout = () => window.matchMedia("(max-width: 768px)").matches;
  const setMobileMenuOpen = open => {
    sidebar.classList.toggle("sidebar--mobile-open", open);
    sidebar.inert = isMobileLayout() && !open;
    mobileMenuToggle.setAttribute("aria-expanded", String(open));
    mobileMenuToggle.setAttribute("aria-label", open ? "Navigation schließen" : "Navigation öffnen");
    sidebarBackdrop.hidden = !open;
  };
  if (localStorage.getItem("sidebar-collapsed") === "true") sidebar.classList.add("sidebar--collapsed");
  sidebarToggle.addEventListener("click", () => {
    if (isMobileLayout()) {
      setMobileMenuOpen(false);
      return;
    }
    sidebar.classList.toggle("sidebar--collapsed");
    localStorage.setItem("sidebar-collapsed", sidebar.classList.contains("sidebar--collapsed"));
    setTimeout(() => Object.entries(gridApis).forEach(([k, api]) => fitGridColumnsIfNeeded(k, api)), 230);
  });
  mobileMenuToggle.addEventListener("click", () => setMobileMenuOpen(!sidebar.classList.contains("sidebar--mobile-open")));
  sidebarBackdrop.addEventListener("click", () => setMobileMenuOpen(false));
  sidebar.addEventListener("click", event => {
    if (isMobileLayout() && event.target.closest("button") && event.target !== sidebarToggle) setMobileMenuOpen(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && sidebar.classList.contains("sidebar--mobile-open")) {
      setMobileMenuOpen(false);
      mobileMenuToggle.focus();
    }
  });
  window.addEventListener("resize", () => setMobileMenuOpen(false));
  setMobileMenuOpen(false);

};

const updateGlobalSearchVisibility = activeTarget => {
  const searchInput = document.getElementById("globalSearchInput");
  const clearFiltersButton = document.getElementById("clearAllFiltersBtn");
  const target = activeTarget || document.querySelector("#mainTabs .nav-link.active")?.dataset.bsTarget;
  const isSearchable = searchableTabTargets.has(target);

  searchInput.hidden = !isSearchable;
  if (clearFiltersButton) clearFiltersButton.hidden = !isSearchable;
  if (isSearchable) {
    applyQuickFilter(searchInput.value.trim());
  } else {
    searchInput.blur();
    Object.values(gridApis).forEach(api => setGridQuickFilter(api, ""));
  }
};

const initGrids = () => {
  gridApis.overview = createGrid("overview", "overviewGrid", getOverviewColumns());
  gridApis.payments = createGrid("payments", "paymentsGrid", getPaymentColumns());
  gridApis.christmas = createGrid("christmas", "christmasGrid", getChristmasColumns());
  gridApis.historical = createGrid("historical", "historicalGrid", getHistoricalColumns());
  gridApis.guests = createGrid("guests", "guestsGrid", getGuestsColumns(), { rowClassRules: {} });
};

const wireGridFilterControls = (gridDiv, api) => {
  const syncClearButtons = () => {
    const filterModel = api.getFilterModel();
    gridDiv.querySelectorAll(".ag-floating-filter[col-id]").forEach(floatingFilter => {
      const columnId = floatingFilter.getAttribute("col-id");
      const existingButton = floatingFilter.querySelector(":scope > .ag-floating-filter-clear-button");
      if (!Object.hasOwn(filterModel, columnId)) {
        existingButton?.remove();
        return;
      }
      if (existingButton) return;

      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "ag-floating-filter-clear-button";
      clearButton.title = "Filter löschen";
      clearButton.setAttribute("aria-label", "Filter löschen");
      clearButton.textContent = "×";
      floatingFilter.insertBefore(clearButton, floatingFilter.querySelector(":scope > .ag-floating-filter-button"));
    });
  };

  gridDiv.addEventListener("click", async event => {
    const target = event.target instanceof Element ? event.target : null;
    const clearButton = target?.closest(".ag-floating-filter-clear-button");
    if (clearButton) {
      const columnId = clearButton.closest(".ag-floating-filter")?.getAttribute("col-id");
      if (!columnId) return;
      await api.setColumnFilterModel(columnId, null);
      api.onFilterChanged();
      return;
    }

    const resetButton = target?.closest(".ag-filter-apply-panel-button");
    if (resetButton?.textContent.trim() === gridLocaleText.resetFilter) {
      setTimeout(() => api.hidePopupMenu(), 0);
    }
  });
  api.addEventListener("filterChanged", syncClearButtons);
  api.addEventListener("virtualColumnsChanged", syncClearButtons);
  syncClearButtons();
};

const createGrid = (gridKey, containerId, columnDefs, overrides = {}) => {
  const gridDiv = document.getElementById(containerId);
  const theme = createGridTheme();
  const options = {
    ...(theme ? { theme } : {}),
    columnDefs,
    rowData: [],
    defaultColDef: {
      sortable: true,
      filter: true,
      floatingFilter: true,
      filterParams: { buttons: ["reset"] },
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
    onColumnMoved: event => saveGridColumnState(gridKey, event.api),
    onColumnPinned: event => saveGridColumnState(gridKey, event.api),
    onColumnResized: event => {
      if (event.finished) saveGridColumnState(gridKey, event.api);
    },
    onColumnVisible: event => saveGridColumnState(gridKey, event.api),
    onSortChanged: event => saveGridColumnState(gridKey, event.api),
    onRowDoubleClicked: event => memberForm.open(event.data.id),
    ...overrides
  };

  const api = createAgGrid(gridDiv, options);
  wireGridFilterControls(gridDiv, api);
  restoreGridColumnState(gridKey, api);
  return api;
};

const getOverviewColumns = () => [
  getPhotoColumn(),
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Email", field: "email", minWidth: 220 },
  { headerName: "Handy", field: "handy", minWidth: 150 },
  { headerName: "Geburtstag", field: "geburtstag", valueFormatter: dateFormatter, filter: "agDateColumnFilter", filterParams: { buttons: ["reset"], comparator: compareIsoDateToFilterDate, inRangeInclusive: true }, minWidth: 140 },
  { headerName: "Eintrittsdatum", field: "eintrittsdatum", valueFormatter: dateFormatter, filter: "agDateColumnFilter", filterParams: { buttons: ["reset"], comparator: compareIsoDateToFilterDate, inRangeInclusive: true }, minWidth: 150 },
  { headerName: "Interessengruppen", field: "interessengruppen", valueFormatter: interestGroupFormatter, filterValueGetter: params => formatInterestGroups(params.data?.interessengruppen), minWidth: 220, flex: 1 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getGuestsColumns = () => [
  getPhotoColumn(),
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Email", field: "email", minWidth: 220 },
  { headerName: "Handy", field: "handy", minWidth: 150 },
  { headerName: "Geburtstag", field: "geburtstag", valueFormatter: dateFormatter, filter: "agDateColumnFilter", filterParams: { buttons: ["reset"], comparator: compareIsoDateToFilterDate, inRangeInclusive: true }, minWidth: 140 },
  { headerName: "Interessengruppen", field: "interessengruppen", valueFormatter: interestGroupFormatter, filterValueGetter: params => formatInterestGroups(params.data?.interessengruppen), minWidth: 220, flex: 1 },
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

const getGridColumnStateKey = gridKey => `${GRID_COLUMN_STATE_PREFIX}${gridKey}`;

const hasSavedGridColumnState = gridKey => {
  try {
    return Boolean(localStorage.getItem(getGridColumnStateKey(gridKey)));
  } catch (error) {
    return false;
  }
};

const saveGridColumnState = (gridKey, api) => {
  if (!api?.getColumnState || restoringGridStateKeys.has(gridKey)) return;

  try {
    localStorage.setItem(getGridColumnStateKey(gridKey), JSON.stringify(api.getColumnState()));
  } catch (error) {
    console.warn("Tabelleneinstellungen konnten nicht gespeichert werden.", error);
  }
};

const restoreGridColumnState = (gridKey, api) => {
  if (!api?.applyColumnState) return;

  let state = null;
  try {
    const rawState = localStorage.getItem(getGridColumnStateKey(gridKey));
    state = rawState ? JSON.parse(rawState) : null;
  } catch (error) {
    console.warn("Tabelleneinstellungen konnten nicht gelesen werden.", error);
  }

  if (!Array.isArray(state) || state.length === 0) return;

  restoringGridStateKeys.add(gridKey);
  api.applyColumnState({ state, applyOrder: true });
  setTimeout(() => restoringGridStateKeys.delete(gridKey), 0);
};

const fitGridColumnsIfNeeded = (gridKey, api) => {
  if (!api?.sizeColumnsToFit || hasSavedGridColumnState(gridKey)) return;
  api.sizeColumnsToFit();
};

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
  { headerName: "Beitrag bezahlt", field: "beitragClubBezahlt", minWidth: 170, filter: false, cellRenderer: paidStatusCellRenderer },
  { headerName: "gezahlter Betrag Club", field: "gezahlterBetragClub", valueFormatter: currencyFormatter, minWidth: 190 },
  { headerName: "Beitrag Computer bezahlt", field: "beitragComputerBezahlt", minWidth: 190, filter: false, cellRenderer: paidStatusCellRenderer },
  { headerName: "gezahlter Betrag Computer", field: "gezahlterBetragComputer", valueFormatter: currencyFormatter, minWidth: 220 },
  { headerName: "Bemerkung", field: "bemerkung", minWidth: 220, flex: 1 }
];

const getChristmasColumns = () => [
  getPhotoColumn(),
  getEditColumn(),
  { headerName: "Name", field: "name", minWidth: 130 },
  { headerName: "Vorname", field: "vorname", minWidth: 130 },
  { headerName: "Weihnachtsessen", field: "weihnachtsessen", valueFormatter: christmasFormatter, minWidth: 150 },
  { headerName: "bezahlt", field: "wnEssenBezahlt", minWidth: 145, filter: false, cellRenderer: paidStatusCellRenderer },
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
    button.addEventListener("click", () => memberForm.open(params.data.id));
    return button;
  }
});

const paidStatusCellRenderer = params => {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "form-check-input table-toggle";
  checkbox.checked = asBoolean(params.value);
  checkbox.disabled = true;
  checkbox.title = checkbox.checked ? "Bezahlt" : "Nicht bezahlt";
  checkbox.setAttribute("aria-label", checkbox.title);
  return checkbox;
};

const togglePaymentComputerGroups = () => {
  state.showOnlyPaymentComputerGroups = !state.showOnlyPaymentComputerGroups;
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  refreshAllViews();
};

const togglePaymentClubOpen = () => {
  const shouldShowOpenOnly = !state.showOnlyOpenClubPayments;
  state.showOnlyOpenClubPayments = shouldShowOpenOnly;
  if (shouldShowOpenOnly) {
    clearGlobalSearch();
    clearGridFilters(gridApis.payments);
  }
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  refreshAllViews();
};

const showOpenClubPayments = () => {
  state.showOnlyPaymentComputerGroups = false;
  state.showOnlyOpenClubPayments = true;
  clearGlobalSearch();
  clearGridFilters(gridApis.payments);
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  refreshAllViews();

  const paymentsTab = document.getElementById("payments-tab");
  Tab.getOrCreateInstance(paymentsTab).show();
};

const updatePaymentComputerGroupToggle = () => {
  const button = document.getElementById("togglePaymentComputerGroupsBtn");
  button.setAttribute("aria-pressed", String(state.showOnlyPaymentComputerGroups));
  button.classList.toggle("active", state.showOnlyPaymentComputerGroups);
};
const updatePaymentClubOpenToggle = () => {
  const button = document.getElementById("togglePaymentClubOpenBtn");
  button.setAttribute("aria-pressed", String(state.showOnlyOpenClubPayments));
  button.classList.toggle("active", state.showOnlyOpenClubPayments);
};
const filterPaymentMembers = members => {
  return members
    .filter(member => !state.showOnlyPaymentComputerGroups || isComputerGroupMember(member))
    .filter(member => !state.showOnlyOpenClubPayments || isOpenClubPaymentMember(member));
};

const downloadTextFile = (fileName, lines) => {
  const content = lines.join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const filterOperatorLabels = {
  contains: "enthält",
  notContains: "enthält nicht",
  equals: "ist gleich",
  notEqual: "ist nicht gleich",
  startsWith: "beginnt mit",
  endsWith: "endet mit",
  lessThan: "ist kleiner als",
  lessThanOrEqual: "ist höchstens",
  greaterThan: "ist größer als",
  greaterThanOrEqual: "ist mindestens",
  inRange: "liegt zwischen",
  blank: "ist leer",
  notBlank: "ist nicht leer"
};

const formatFilterCondition = model => {
  if (Array.isArray(model?.conditions)) {
    const separator = model.operator === "OR" ? " oder " : " und ";
    return model.conditions.map(formatFilterCondition).join(separator);
  }
  const operator = filterOperatorLabels[model?.type] || model?.type || "entspricht";
  const normalizeValue = value => model?.filterType === "date"
    ? formatDateDE(String(value).slice(0, 10))
    : String(value);
  const values = (Array.isArray(model?.values)
    ? model.values
    : [model?.filter ?? model?.dateFrom, model?.filterTo ?? model?.dateTo])
    .filter(value => value !== undefined && value !== null && value !== "")
    .map(normalizeValue);
  if (!values.length) return operator;
  if (model?.type === "inRange" && values.length > 1) return `${operator} "${values[0]}" und "${values[1]}"`;
  return `${operator} ${values.map(value => `"${value}"`).join(", ")}`;
};

const getOverviewFilterLines = api => {
  const quickFilter = document.getElementById("globalSearchInput")?.value.trim();
  const columnFilters = Object.entries(api.getFilterModel()).map(([columnId, model]) => {
    const label = api.getColumnDef(columnId)?.headerName || columnId;
    return `- ${label}: ${formatFilterCondition(model)}`;
  });
  const filters = [...(quickFilter ? [`- Suche: "${quickFilter}"`] : []), ...columnFilters];
  return filters.length ? filters : ["- Keine"];
};

const downloadMembers = () => {
  const api = gridApis.overview;
  if (!api) return;
  const members = [];
  api.forEachNodeAfterFilterAndSort(node => {
    if (node.data) members.push(node.data);
  });
  const readableValue = value => value === null || value === undefined || value === "" ? "-" : value;
  const today = formatDateDE(formatIsoDate(new Date()));
  const lines = [
    "MITGLIEDERLISTE",
    `Erstellt am: ${today}`,
    "",
    "GEWÄHLTE FILTER",
    ...getOverviewFilterLines(api),
    "",
    `Anzahl Personen: ${members.length}`,
    "",
    ...members.flatMap((member, index) => {
      const age = calculateAge(member.geburtstag);
      const address = [member.strasse, [member.plz, member.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const note = String(member.bemerkung || "").trim().replace(/\s+/g, " ");
      return [
        `${index + 1}. ${formatMemberName(member)}${age === null ? "" : ` (${age} Jahre)`}`,
        `   Geburtstag: ${member.geburtstag ? formatDateDE(member.geburtstag) : "-"}`,
        `   Eintrittsdatum: ${member.eintrittsdatum ? formatDateDE(member.eintrittsdatum) : "-"}`,
        `   Anschrift: ${readableValue(address)}`,
        `   Telefon: ${readableValue(member.telefon)} | Handy: ${readableValue(member.handy)}`,
        `   E-Mail: ${readableValue(member.email)}`,
        `   Gruppen: ${readableValue(formatInterestGroups(member.interessengruppen))}`,
        ...(note ? [`   Notiz: ${note}`] : []),
        ""
      ];
    })
  ];
  downloadTextFile(`mitgliederliste-${formatIsoDate(new Date())}.txt`, lines);
};

const downloadOpenClubPayments = () => {
  const members = filterPaymentMembers(state.members.filter(member => isActiveMember(member) && !isGuestMember(member)));
  const readableValue = value => value === null || value === undefined || value === "" ? "-" : value;
  const readableGroups = member => readableValue(formatInterestGroups(member.interessengruppen));
  const readablePayment = (paid, amount, date) => {
    if (!asBoolean(paid)) return "Offen";
    const readableAmount = formatCurrency(amount).replace(/\u00a0/g, " ");
    const details = [readableAmount, date ? `am ${formatDateDE(date)}` : ""].filter(Boolean).join(" ");
    return details ? `Bezahlt – ${details}` : "Bezahlt";
  };
  const readableComputerPayment = member => isComputerGroupMember(member)
    ? readablePayment(member.beitragComputerBezahlt, member.gezahlterBetragComputer, member.einzahlungComputerAm)
    : "";
  const today = formatDateDE(formatIsoDate(new Date()));
  const lines = [
    "BEZAHLDATEN",
    `Erstellt am: ${today}`,
    `Anzahl Personen: ${members.length}`,
    "",
    ...members.flatMap((member, index) => {
      const age = calculateAge(member.geburtstag);
      const computerPayment = readableComputerPayment(member);
      const note = String(member.bemerkung || "").trim().replace(/\s+/g, " ");
      return [
        `${index + 1}. ${formatMemberName(member)}${age === null ? "" : ` (${age} Jahre)`}`,
        `   Gruppen: ${readableGroups(member)}`,
        `   Telefon: ${readableValue(member.telefon)} | Handy: ${readableValue(member.handy)}`,
        `   Club-Beitrag: ${readablePayment(member.beitragClubBezahlt, member.gezahlterBetragClub, member.einzahlungClubAm)}`,
        ...(computerPayment ? [`   Computer-Beitrag: ${computerPayment}`] : []),
        ...(note ? [`   Notiz: ${note}`] : []),
        ""
      ];
    })
  ];
  downloadTextFile(`bezahldaten-${formatIsoDate(new Date())}.txt`, lines);
};

const refreshAllViews = () => {
  const sortByName = (a, b) => {
    const nameA = String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" });
    if (nameA !== 0) return nameA;
    return String(a.vorname || "").localeCompare(String(b.vorname || ""), "de", { sensitivity: "base" });
  };

  const activeMembers = [...state.members].filter(isActiveMember).sort(sortByName);
  const nonGuests = activeMembers.filter(m => !isGuestMember(m));
  const guests = activeMembers.filter(isGuestMember);

  setGridData(gridApis.overview, nonGuests);
  setGridData(gridApis.payments, filterPaymentMembers(nonGuests));
  setGridData(gridApis.christmas, nonGuests);
  setGridData(gridApis.guests, guests);
  renderFunctionOverview(nonGuests);

  const historicalMembers = [...state.members]
    .filter(m => !isActiveMember(m) && !isGuestMember(m))
    .sort(sortByName);
  setGridData(gridApis.historical, historicalMembers);

  refreshDashboard();

  applyQuickFilter(document.getElementById("globalSearchInput").value.trim());

  Object.entries(gridApis).forEach(([gridKey, api]) => fitGridColumnsIfNeeded(gridKey, api));
};

const renderFunctionOverview = members => {
  const grid = document.getElementById("functionOverviewGrid");
  const summary = document.getElementById("functionOverviewSummary");
  if (!grid) return;

  const entries = new Map(
    Object.entries(funktionsMap)
      .filter(([, label]) => label)
      .map(([id, label]) => [Number(id), { label, members: [] }])
  );
  members.forEach(member => {
    getMemberFunctionIds(member).forEach(functionId => {
      const entry = entries.get(functionId);
      if (entry) entry.members.push(member);
    });
  });

  const visibleEntries = [...entries.values()]
    .sort((a, b) => functionOverviewSortWeight(a.label) - functionOverviewSortWeight(b.label) || germanCollator.compare(a.label, b.label));
  const uniqueMembers = new Set(visibleEntries.flatMap(entry => entry.members.map(member => member.id)));

  if (summary) summary.textContent = `${visibleEntries.length} Funktionen · ${uniqueMembers.size} Mitglieder`;
  grid.replaceChildren();

  if (!visibleEntries.length) {
    const empty = document.createElement("div");
    empty.className = "function-overview__empty";
    empty.textContent = "Für aktive Mitglieder sind keine Funktionen hinterlegt.";
    grid.appendChild(empty);
    return;
  }

  visibleEntries.forEach(entry => {
    const card = document.createElement("article");
    card.className = "function-card";

    const header = document.createElement("header");
    header.className = "function-card__header";
    const title = document.createElement("h3");
    title.className = "function-card__title";
    title.textContent = entry.label;
    const count = document.createElement("span");
    count.className = "function-card__count";
    count.textContent = String(entry.members.length);
    count.setAttribute("aria-label", `${entry.members.length} Mitglieder`);
    header.append(title, count);

    const memberList = document.createElement("div");
    memberList.className = "function-card__members";
    if (!entry.members.length) {
      const empty = document.createElement("p");
      empty.className = "function-card__empty";
      empty.textContent = "Niemand zugeordnet";
      memberList.appendChild(empty);
    }
    [...entry.members]
      .sort((a, b) => germanCollator.compare(formatMemberName(a), formatMemberName(b)))
      .forEach(member => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "function-card__member";
        button.title = "Mitglied bearbeiten";
        button.addEventListener("click", () => memberForm.open(member.id));

        const details = document.createElement("span");
        const name = document.createElement("span");
        name.className = "function-card__member-name";
        name.textContent = formatMemberName(member);
        const groups = document.createElement("span");
        groups.className = "function-card__member-groups";
        groups.textContent = formatInterestGroups(member.interessengruppen) || "Keine Interessengruppe hinterlegt";
        details.append(name, groups);

        button.append(details);
        memberList.appendChild(button);
      });

    card.append(header, memberList);
    grid.appendChild(card);
  });
};

const functionOverviewSortWeight = label => {
  const normalized = normalizeGroupText(label);
  if (normalized === "vorstand") return 0;
  if (normalized.includes("ersthelfer")) return 1;
  if (normalized.includes("rote karte")) return 2;
  if (normalized.includes("gruppenleiter")) return 3;
  return 4;
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

const clearGlobalSearch = () => {
  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) searchInput.value = "";
  Object.values(gridApis).forEach(api => setGridQuickFilter(api, ""));
};

const clearGridFilters = api => {
  if (!api) return;
  api.setFilterModel?.(null);
  api.onFilterChanged?.();
};

const clearAllFilters = () => {
  clearGlobalSearch();
  Object.values(gridApis).forEach(clearGridFilters);
  state.showOnlyPaymentComputerGroups = false;
  state.showOnlyOpenClubPayments = false;
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  refreshAllViews();
};

const showOverviewWithFilter = filterModel => {
  clearGlobalSearch();
  refreshAllViews();

  const overviewApi = gridApis.overview;
  clearGridFilters(overviewApi);
  overviewApi?.setFilterModel?.(filterModel);
  overviewApi?.onFilterChanged?.();

  const overviewTab = document.getElementById("overview-tab");
  if (overviewTab) Tab.getOrCreateInstance(overviewTab).show();
};

const showGuestOverview = () => {
  clearGlobalSearch();
  clearGridFilters(gridApis.guests);

  const guestsTab = document.getElementById("guests-tab");
  if (guestsTab) Tab.getOrCreateInstance(guestsTab).show();
};

const showOverviewForInterestGroup = group => {
  if (!group?.label) return;
  showOverviewWithFilter({
    interessengruppen: {
      filterType: "text",
      type: "contains",
      filter: group.label
    }
  });
};

const showOverviewForAgeBucket = bucket => {
  if (!bucket) return;
  const range = getBirthDateRangeForAgeBucket(bucket);
  showOverviewWithFilter({
    geburtstag: {
      filterType: "date",
      type: "inRange",
      dateFrom: range.from,
      dateTo: range.to
    }
  });
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

const findMemberById = id => state.members.find(member => member.id === id);

const resolveMemberPhotoDataUrl = async member => {
  if (member?.id && member.hasPassbildInDb) {
    return fetchMemberPhotoObjectUrl(member.id);
  }
  return null;
};

const loadStoredMembers = async () => {
  try {
    return await loadMembersFromApi();
  } catch (error) {
    console.warn("Mitgliederdaten konnten nicht ueber die API geladen werden.", error);
    return null;
  }
};
