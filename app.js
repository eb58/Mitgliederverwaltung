"use strict";

const interestGroups = [];

const germanCollator = new Intl.Collator("de", { sensitivity: "base", numeric: true });
const interestGroupMap = {};

const seniorenclubsMap = [];

const austrittsgrundMap = {};

const christmasChoiceMap = {
  0: "Nein",
  1: "Ja",
  2: "Ja + Gast"
};

const MEMBER_CLUB_ID = 9;

const funktionsMap = {};


const interestGroupOptions = [];
const groupChoiceOptions = [];
const austrittsgrundOptions = [];
const funktionsOptions = [];
const seniorenclubOptions = [];

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
  { key: "gruppenwahl", label: "Gruppenwahl", type: "select", options: groupChoiceOptions, allowEmpty: true },
  { key: "funktion", label: "Funktion", type: "multiselect", options: funktionsOptions, valueType: "textList" },
  { key: "auswahl", label: "Auswahl", type: "checkbox" },
  { key: "ausweisErteilt", label: "Ausweis erteilt", type: "checkbox" },
  { key: "clubzugehoerigkeit", label: "Clubzugehörigkeit", type: "select", options: seniorenclubOptions, allowEmpty: true, valueType: "number" },
  { key: "weihnachtsessen", label: "Weihnachtsessen", type: "select", options: [{ value: 0, label: "Nein" }, { value: 1, label: "Ja" }, { value: 2, label: "Ja + Gast" }] },
  { key: "wnEssenBezahlt", label: "bezahlt", type: "checkbox" },
  { key: "beitragClubBezahlt", label: "Beitrag bezahlt", type: "checkbox" },
  { key: "betragClubBar", label: "Betrag bar", type: "currency" },
  { key: "beitragComputerBezahlt", label: "Beitrag Computer bezahlt", type: "checkbox" },
  { key: "betragComputerBar", label: "Beitrag Computer bar", type: "currency" },
  { key: "gezahlterBetragClub", label: "gezahlter Betrag Club", type: "currency" },
  { key: "einzahlungClubAm", label: "Einzahlung Club am", type: "date" },
  { key: "gezahlterBetragComputer", label: "gezahlter Betrag Computer", type: "currency" },
  { key: "einzahlungComputerAm", label: "Einzahlung Computer am", type: "date" },
  { key: "gezahlterBetragWeihnachten", label: "gezahlter Betrag Weihnachten", type: "currency" },
  { key: "bemerkung", label: "Bemerkung", type: "textarea" },
  { key: "tischnummer", label: "Tischnummer", type: "number" }
];

const paidAmountDefaults = {
  beitragClubBezahlt: { amountField: "gezahlterBetragClub", amount: 30, dateField: "einzahlungClubAm" },
  beitragComputerBezahlt: { amountField: "gezahlterBetragComputer", amount: 20, dateField: "einzahlungComputerAm" },
  wnEssenBezahlt: { amountField: "gezahlterBetragWeihnachten" }
};

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
      "clubzugehoerigkeit",
      "interessengruppen",
      "funktion",
      "gruppenwahl",
      "auswahl",
      "ausweisErteilt"
    ]
  },
  {
    id: "zahlungen",
    label: "Zahlungen",
    groups: [
      {
        label: "Club",
        fieldKeys: [
          "beitragClubBezahlt",
          "gezahlterBetragClub",
          "einzahlungClubAm"
        ]
      },
      {
        label: "Computer",
        fieldKeys: [
          "beitragComputerBezahlt",
          "gezahlterBetragComputer",
          "einzahlungComputerAm"
        ]
      }
    ]
  },
  {
    id: "weihnachten",
    label: "Weihnachten",
    fieldKeys: [
      "weihnachtsessen",
      "wnEssenBezahlt",
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
  editingId: null,
  showOnlyPaymentComputerGroups: false,
  showOnlyOpenClubPayments: false,
  recentChanges: [],
  currentUser: null,
  authToken: localStorage.getItem("mitgliederverwaltung:authToken") || ""
};

const gridApis = {
  overview: null,
  payments: null,
  christmas: null,
  historical: null,
  guests: null
};

let ageHistogramChart = null;
let interestGroupChart = null;

const MEMBER_API_BROWSER_CONFIG_FILE_NAME = "member-api.config.json";
const PHP_MEMBER_API_BASE_PATH = "/mitgliederverwaltung/php-api/index.php";
const DEFAULT_MEMBER_API_BASE_URL = globalThis.location.protocol.startsWith("http")
  ? new URL(PHP_MEMBER_API_BASE_PATH, globalThis.location.origin).toString()
  : "https://senioren-luebars.berlin/mitgliederverwaltung/php-api/index.php";
const MEMBER_API_PAGE_SIZE = 500;
const AUTH_TOKEN_STORAGE_KEY = "mitgliederverwaltung:authToken";
const GRID_COLUMN_STATE_PREFIX = "mitgliederverwaltung:gridColumnState:";
const PASSWORD_VISIBILITY_MS = 1000;
const searchableTabTargets = new Set([
  "#overview-pane",
  "#payments-pane",
  "#christmas-pane",
  "#historical-pane",
  "#guests-pane"
]);
const gridApiByTabTarget = {
  "#overview-pane": "overview",
  "#payments-pane": "payments",
  "#christmas-pane": "christmas",
  "#historical-pane": "historical",
  "#guests-pane": "guests"
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

const computerGroupPatterns = [
  "computer",
  "excel",
  "grundlagen",
  "pc",
  "publisher",
  "video",
  "winsoft"
];

let memberModal = null;
let loginModal = null;
let userAdminModal = null;
let referenceDataModal = null;
let loginWaitResolve = null;
let passwordChangeRequiredFlow = true;
let memberApiBaseUrl = DEFAULT_MEMBER_API_BASE_URL;
let selectedMemberPhotoFile = null;
let referenceAdminData = {};
let selectedMemberPhotoObjectUrl = null;
const restoringGridStateKeys = new Set();
const passwordVisibilityTimers = new Map();

const replaceObjectContents = (target, entries) => {
  Object.keys(target).forEach(key => delete target[key]);
  Object.assign(target, Object.fromEntries(entries));
};

const replaceArrayContents = (target, values) => {
  target.splice(0, target.length, ...values);
};

const refreshReferenceOptions = () => {
  replaceObjectContents(interestGroupMap, interestGroups.map(group => [group.id, group.label]));
  replaceArrayContents(
    interestGroupOptions,
    [...interestGroups]
      .sort((a, b) => germanCollator.compare(a.label, b.label))
      .map(group => ({ value: group.id, label: group.label }))
  );
  replaceArrayContents(
    groupChoiceOptions,
    [...interestGroups]
      .sort((a, b) => germanCollator.compare(a.label, b.label))
      .map(group => ({ value: group.label, label: group.label }))
  );
  replaceArrayContents(
    austrittsgrundOptions,
    Object.entries(austrittsgrundMap)
      .filter(([, label]) => label)
      .map(([value, label]) => ({ value: Number(value), label }))
  );
  replaceArrayContents(
    funktionsOptions,
    Object.entries(funktionsMap).map(([value, label]) => ({ value: Number(value), label }))
  );
  replaceArrayContents(
    seniorenclubOptions,
    seniorenclubsMap.map(club => ({ value: club.id, label: club.name }))
  );
};

refreshReferenceOptions();

const loadMemberApiBrowserConfig = async () => {
  if (!globalThis.location.protocol.startsWith("http")) return;
  try {
    const response = await fetch(MEMBER_API_BROWSER_CONFIG_FILE_NAME, { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    const configuredBaseUrl = String(config.memberApiBaseUrl || "").trim();
    if (configuredBaseUrl) {
      memberApiBaseUrl = configuredBaseUrl;
    }
  } catch (error) {
    console.warn("API-Browser-Konfiguration konnte nicht gelesen werden.", error);
  }
};

const initApp = async () => {
  setAppShellVisible(false);
  await loadMemberApiBrowserConfig();
  loginModal = new bootstrap.Modal(document.getElementById("loginModal"), {
    backdrop: "static",
    keyboard: false
  });
  wireLoginForm();
  await ensureAuthenticated();
  await loadReferenceData();

  const loadedMembers = await loadStoredMembers();
  state.members = loadedMembers || [];
  state.nextId = getNextId(state.members);

  buildMemberForm();
  memberModal = new bootstrap.Modal(document.getElementById("memberModal"));
  userAdminModal = new bootstrap.Modal(document.getElementById("userAdminModal"));
  referenceDataModal = new bootstrap.Modal(document.getElementById("referenceDataModal"));
  buildReferenceDataAdmin();
  initGrids();
  wireUi();
  refreshAllViews();
  refreshRecentChanges();
  setAppShellVisible(true);
};

document.addEventListener("DOMContentLoaded", () => {
  initApp().catch(error => {
    console.error("Initialisierung fehlgeschlagen.", error);
    state.members = [];
    state.nextId = getNextId(state.members);
    loginModal = new bootstrap.Modal(document.getElementById("loginModal"), {
      backdrop: "static",
      keyboard: false
    });
    wireLoginForm();
    buildMemberForm();
    memberModal = new bootstrap.Modal(document.getElementById("memberModal"));
    userAdminModal = new bootstrap.Modal(document.getElementById("userAdminModal"));
    referenceDataModal = new bootstrap.Modal(document.getElementById("referenceDataModal"));
    buildReferenceDataAdmin();
    initGrids();
    wireUi();
    refreshAllViews();
    renderRecentChanges([], { message: "\u00c4nderungen konnten nicht geladen werden." });
  });
});

const wireLoginForm = () => {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm || loginForm.dataset.wired === "true") return;
  loginForm.dataset.wired = "true";
  loginForm.addEventListener("submit", handleLoginSubmit);
  document.getElementById("passwordChangeForm").addEventListener("submit", handlePasswordChangeSubmit);
  document.getElementById("passwordChangeCancelBtn").addEventListener("click", handlePasswordChangeCancel);
  document.querySelectorAll("[data-password-target]").forEach(button => {
    button.addEventListener("click", togglePasswordVisibility);
  });
};

const clearPasswordVisibilityTimer = inputId => {
  const timer = passwordVisibilityTimers.get(inputId);
  if (!timer) return;
  clearTimeout(timer);
  passwordVisibilityTimers.delete(inputId);
};

const setPasswordVisibility = (inputId, visible) => {
  const passwordInput = document.getElementById(inputId);
  const button = document.querySelector(`[data-password-target="${inputId}"]`);
  if (!passwordInput || !button) return;

  passwordInput.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
  button.setAttribute("aria-label", visible ? "Passwort verbergen" : "Passwort anzeigen");
  if (!visible) clearPasswordVisibilityTimer(inputId);
};

const hidePasswordFields = (...inputIds) => {
  inputIds.forEach(inputId => setPasswordVisibility(inputId, false));
};

const togglePasswordVisibility = event => {
  const inputId = event.currentTarget.dataset.passwordTarget;
  if (!inputId) return;

  const passwordInput = document.getElementById(inputId);
  if (!passwordInput) return;

  const nextIsVisible = passwordInput.type === "password";
  setPasswordVisibility(inputId, nextIsVisible);
  if (!nextIsVisible) return;

  clearPasswordVisibilityTimer(inputId);
  passwordVisibilityTimers.set(inputId, setTimeout(() => setPasswordVisibility(inputId, false), PASSWORD_VISIBILITY_MS));
};

const clearPasswordChangeForm = () => {
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmNewPassword").value = "";
  document.getElementById("passwordChangeError").hidden = true;
  hidePasswordFields("newPassword", "confirmNewPassword");
};

const showLoginForm = () => {
  document.getElementById("loginForm").hidden = false;
  document.getElementById("passwordChangeForm").hidden = true;
  document.getElementById("loginError").hidden = true;
  hidePasswordFields("loginPassword");
  clearPasswordChangeForm();
};

const showPasswordChangeForm = ({ required = true } = {}) => {
  passwordChangeRequiredFlow = required;
  document.getElementById("loginForm").hidden = true;
  document.getElementById("passwordChangeForm").hidden = false;
  document.getElementById("passwordChangeCancelBtn").hidden = false;
  clearPasswordChangeForm();
  setTimeout(() => document.getElementById("newPassword")?.focus(), 150);
};

const abortRequiredPasswordChange = async () => {
  const token = state.authToken;
  clearAuthToken();
  state.currentUser = null;
  state.members = [];
  state.nextId = 1;
  refreshAllViews();
  setAppShellVisible(false);
  showLoginForm();
  loginModal.show();

  if (token) {
    try {
      await requestMemberApi("/api/session", { method: "DELETE", authToken: token });
    } catch (error) {
      console.warn("Server-Logout nach abgebrochenem Passwortwechsel fehlgeschlagen.", error);
    }
  }
};

const handlePasswordChangeCancel = async () => {
  if (passwordChangeRequiredFlow) {
    await abortRequiredPasswordChange();
    return;
  }
  loginModal.hide();
  showLoginForm();
  setAppShellVisible(true);
};

const finishAuthenticatedLogin = async () => {
  loginModal.hide();
  showLoginForm();
  if (loginWaitResolve) {
    loginWaitResolve(true);
    loginWaitResolve = null;
  } else {
    await reloadMembersFromApi();
  }
  setAppShellVisible(true);
};

const handleLoginSubmit = async event => {
  event.preventDefault();
  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");
  const errorElement = document.getElementById("loginError");

  try {
    errorElement.hidden = true;
    await login(usernameInput.value.trim(), passwordInput.value);
    passwordInput.value = "";
    if (state.currentUser?.passwordChangeRequired) {
      setAppShellVisible(false);
      showPasswordChangeForm();
      return;
    }
    await finishAuthenticatedLogin();
  } catch (error) {
    errorElement.textContent = error.message || "Anmeldung fehlgeschlagen.";
    errorElement.hidden = false;
  }
};

const handlePasswordChangeSubmit = async event => {
  event.preventDefault();
  const passwordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmNewPassword");
  const errorElement = document.getElementById("passwordChangeError");
  const password = passwordInput.value;
  const username = state.currentUser?.username || "";

  try {
    errorElement.hidden = true;
    if (!password) {
      throw new Error("Bitte ein neues Passwort eingeben.");
    }
    if (password !== confirmPasswordInput.value) {
      throw new Error("Die Passwoerter stimmen nicht ueberein.");
    }
    if (username && username.toLocaleLowerCase("de") === password.toLocaleLowerCase("de")) {
      throw new Error("Das neue Passwort darf nicht dem Benutzernamen entsprechen.");
    }
    const payload = await changeOwnPasswordViaApi(password);
    state.currentUser = payload?.user || { ...state.currentUser, passwordChangeRequired: false };
    if (state.authToken) setAuthToken(state.authToken);
    updateUserAdminButton();
    passwordInput.value = "";
    confirmPasswordInput.value = "";
    if (passwordChangeRequiredFlow) {
      await finishAuthenticatedLogin();
    } else {
      await handlePasswordChangeCancel();
    }
  } catch (error) {
    errorElement.textContent = error.message || "Passwort konnte nicht geaendert werden.";
    errorElement.hidden = false;
  }
};

const ensureAuthenticated = async () => {
  if (!state.authToken) {
    setAppShellVisible(false);
    showLoginForm();
    loginModal.show();
    return new Promise(resolve => {
      loginWaitResolve = resolve;
    });
  }

  try {
    const payload = await requestMemberApi("/api/session");
    state.currentUser = payload.user || null;
    updateUserAdminButton();
    if (state.currentUser?.passwordChangeRequired) {
      setAuthToken(state.authToken, { persist: false });
      setAppShellVisible(false);
      showPasswordChangeForm();
      loginModal.show();
      return new Promise(resolve => {
        loginWaitResolve = resolve;
      });
    }
    return true;
  } catch (error) {
    clearAuthToken();
    state.currentUser = null;
    setAppShellVisible(false);
    showLoginForm();
    loginModal.show();
    return new Promise(resolve => {
      loginWaitResolve = resolve;
    });
  }
};

const login = async (username, password) => {
  const payload = await requestMemberApi("/api/session", {
    method: "POST",
    body: { username, password },
    requiresAuth: false
  });
  state.currentUser = payload.user || null;
  updateUserAdminButton();
  setAuthToken(payload.token, { persist: !state.currentUser?.passwordChangeRequired });
};

const setAuthToken = (token, { persist = true } = {}) => {
  state.authToken = token || "";
  if (state.authToken && persist) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, state.authToken);
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
};

const clearAuthToken = () => setAuthToken("");

const logout = () => {
  const token = state.authToken;
  clearAuthToken();
  state.currentUser = null;
  state.members = [];
  state.nextId = 1;
  refreshAllViews();
  setAppShellVisible(false);
  showLoginForm();
  loginModal.show();

  if (token) {
    requestMemberApi("/api/session", { method: "DELETE", authToken: token }).catch(error => {
      console.warn("Server-Logout fehlgeschlagen.", error);
    });
  }
};

const reloadMembersFromApi = async () => {
  const members = await loadMembersFromApi();
  state.members = members;
  state.nextId = getNextId(state.members);
  setAppShellVisible(true);
  refreshAllViews();
};

const loadUsersFromApi = () => requestMemberApi("/api/users");
const createUserViaApi = user => requestMemberApi("/api/users", { method: "POST", body: user });
const updateUserViaApi = user => requestMemberApi(`/api/users/${user.id}`, { method: "PUT", body: user });
const deactivateUserViaApi = id => requestMemberApi(`/api/users/${id}`, { method: "DELETE" });
const changeOwnPasswordViaApi = password => requestMemberApi("/api/session/password", { method: "PUT", body: { password } });
const loadReferenceDataFromApi = () => requestMemberApi("/api/reference-data");
const loadReferenceItemsFromApi = type => requestMemberApi(`/api/reference-data/${type}`);
const createReferenceItemViaApi = (type, item) => requestMemberApi(`/api/reference-data/${type}`, { method: "POST", body: item });
const updateReferenceItemViaApi = (type, item) => requestMemberApi(`/api/reference-data/${type}/${item.id}`, { method: "PUT", body: item });
const deleteReferenceItemViaApi = (type, id) => requestMemberApi(`/api/reference-data/${type}/${id}`, { method: "DELETE" });
const loadRecentMemberChangesViaApi = () => requestMemberApi("/api/member-changes", { params: { limit: 100 } });

const referenceSections = [
  { type: "interest-groups", title: "Interessengruppen", labelName: "Bezeichnung" },
  { type: "functions", title: "Funktionen", labelName: "Bezeichnung" },
  { type: "exit-reasons", title: "Austrittsgründe", labelName: "Bezeichnung" },
  { type: "senior-clubs", title: "Seniorenclubs", labelName: "Name" }
];

const applyReferenceData = data => {
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

const loadReferenceData = async () => {
  try {
    applyReferenceData(await loadReferenceDataFromApi());
  } catch (error) {
    console.warn("Stammdaten konnten nicht ueber die API geladen werden.", error);
  }
};

const loadReferenceAdminData = async () => {
  const entries = await Promise.all(referenceSections.map(async section => {
    const data = await loadReferenceItemsFromApi(section.type);
    return [section.type, data.items || []];
  }));
  referenceAdminData = Object.fromEntries(entries);
};

const resetUserForm = () => {
  document.getElementById("userId").value = "";
  document.getElementById("userUsername").value = "";
  document.getElementById("userUsername").disabled = false;
  document.getElementById("userPassword").value = "";
  document.getElementById("userPassword").required = true;
  document.getElementById("userRole").value = "admin";
  document.getElementById("userActive").checked = true;
  document.getElementById("userAdminError").hidden = true;
};

const renderUsers = users => {
  const tbody = document.getElementById("userTableBody");
  tbody.replaceChildren(...users.map(user => {
    const row = document.createElement("tr");
    const cells = [
      user.username,
      user.role,
      user.active ? "aktiv" : "inaktiv"
    ].map(text => {
      const cell = document.createElement("td");
      cell.textContent = text;
      return cell;
    });
    const actions = document.createElement("td");
    const editButton = document.createElement("button");
    editButton.className = "btn btn-sm btn-outline-secondary me-2";
    editButton.type = "button";
    editButton.textContent = "Bearbeiten";
    editButton.addEventListener("click", () => fillUserForm(user));
    const deactivateButton = document.createElement("button");
    deactivateButton.className = "btn btn-sm btn-outline-danger";
    deactivateButton.type = "button";
    deactivateButton.textContent = "Deaktivieren";
    deactivateButton.disabled = !user.active || user.id === state.currentUser?.id;
    deactivateButton.addEventListener("click", () => deactivateUser(user.id));
    actions.append(editButton, deactivateButton);
    row.append(...cells, actions);
    return row;
  }));
};

const fillUserForm = user => {
  document.getElementById("userId").value = user.id;
  document.getElementById("userUsername").value = user.username;
  document.getElementById("userUsername").disabled = true;
  document.getElementById("userPassword").value = "";
  document.getElementById("userPassword").required = false;
  document.getElementById("userRole").value = user.role || "admin";
  document.getElementById("userActive").checked = Boolean(user.active);
  document.getElementById("userAdminError").hidden = true;
};

const refreshUsers = async () => {
  const payload = await loadUsersFromApi();
  renderUsers(Array.isArray(payload.users) ? payload.users : []);
};

const openUserAdminModal = async () => {
  resetUserForm();
  await refreshUsers();
  userAdminModal.show();
};

const openOwnPasswordChangeModal = () => {
  if (!state.currentUser) return;
  showPasswordChangeForm({ required: false });
  loginModal.show();
};

const handleUserFormSubmit = async event => {
  event.preventDefault();
  const errorElement = document.getElementById("userAdminError");
  const id = Number(document.getElementById("userId").value);
  const user = {
    id,
    username: document.getElementById("userUsername").value.trim(),
    password: document.getElementById("userPassword").value,
    role: document.getElementById("userRole").value,
    active: document.getElementById("userActive").checked
  };
  try {
    errorElement.hidden = true;
    if (id) {
      await updateUserViaApi(user);
    } else {
      await createUserViaApi(user);
    }
    resetUserForm();
    await refreshUsers();
  } catch (error) {
    errorElement.textContent = error.message || "Benutzer konnte nicht gespeichert werden.";
    errorElement.hidden = false;
  }
};

const deactivateUser = async id => {
  const errorElement = document.getElementById("userAdminError");
  try {
    errorElement.hidden = true;
    await deactivateUserViaApi(id);
    await refreshUsers();
  } catch (error) {
    errorElement.textContent = error.message || "Benutzer konnte nicht deaktiviert werden.";
    errorElement.hidden = false;
  }
};

const setAppShellVisible = visible => {
  const shell = document.getElementById("appShell");
  if (shell) {
    shell.hidden = !visible;
  }
  updateUserAdminButton();
};

const updateUserAdminButton = () => {
  const isAdmin = String(state.currentUser?.role || "").trim().toLowerCase() === "admin";
  const username = String(state.currentUser?.username || "").trim();

  const changePasswordButton = document.getElementById("changePasswordBtn");
  if (changePasswordButton) changePasswordButton.hidden = !state.currentUser;

  ["manageUsersBtn", "manageReferenceDataBtn"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.hidden = !isAdmin;
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.hidden = !username;
    logoutBtn.title = username ? `Abmelden (${username})` : "Abmelden";
    logoutBtn.setAttribute("aria-label", logoutBtn.title);
  }
  const currentUserName = document.getElementById("currentUserName");
  if (currentUserName) currentUserName.textContent = username;

  const passwordChangeUser = document.getElementById("passwordChangeUser");
  if (passwordChangeUser) {
    passwordChangeUser.hidden = !username;
    passwordChangeUser.textContent = username ? `Benutzer: ${username}` : "";
  }
};

const buildReferenceDataAdmin = () => {
  const panes = document.getElementById("referenceDataPanes");
  if (!panes) return;
  referenceSections.forEach(section => {
    const pane = document.querySelector(`[data-reference-type="${section.type}"]`);
    if (!pane || pane.dataset.built === "true") return;
    pane.dataset.built = "true";
    pane.innerHTML = `
      <form class="reference-form">
        <input type="hidden" data-reference-field="id">
        <div>
          <label class="form-label">ID</label>
          <input class="form-control" type="number" min="1" step="1" data-reference-field="newId" required>
        </div>
        <div>
          <label class="form-label">${section.labelName}</label>
          <input class="form-control" type="text" data-reference-field="label" required>
        </div>
        <div class="reference-form__actions">
          <button class="btn btn-outline-secondary" type="button" data-reference-action="new">Neu</button>
          <button class="btn btn-primary" type="submit">Speichern</button>
        </div>
      </form>
      <div class="table-responsive mt-3">
        <table class="table table-sm align-middle reference-table">
          <thead><tr><th>ID</th><th>${section.labelName}</th><th>Status</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    pane.querySelector(".reference-form").addEventListener("submit", event => handleReferenceFormSubmit(event, section.type));
    pane.querySelector('[data-reference-action="new"]').addEventListener("click", () => resetReferenceForm(section.type));
  });
};

const getReferenceItems = type => {
  if (referenceAdminData[type]) {
    return referenceAdminData[type].map(item => ({
      id: Number(item.id),
      label: item.label || item.name || "",
      active: item.active !== false
    }));
  }
  if (type === "interest-groups") return interestGroups.map(item => ({ id: item.id, label: item.label }));
  if (type === "functions") return Object.entries(funktionsMap).map(([id, label]) => ({ id: Number(id), label }));
  if (type === "exit-reasons") return Object.entries(austrittsgrundMap).map(([id, label]) => ({ id: Number(id), label }));
  if (type === "senior-clubs") return seniorenclubsMap.map(item => ({ id: item.id, label: item.name }));
  return [];
};

const renderReferenceTable = type => {
  const pane = document.querySelector(`[data-reference-type="${type}"]`);
  const tbody = pane?.querySelector("tbody");
  if (!tbody) return;
  const rows = getReferenceItems(type).sort((a, b) => a.id - b.id).map(item => {
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
    editButton.addEventListener("click", () => fillReferenceForm(type, item));
    const toggleButton = document.createElement("button");
    toggleButton.className = item.active === false ? "btn btn-sm btn-outline-primary" : "btn btn-sm btn-outline-danger";
    toggleButton.type = "button";
    toggleButton.textContent = item.active === false ? "Aktivieren" : "Deaktivieren";
    toggleButton.addEventListener("click", () => toggleReferenceItem(type, item));
    actions.append(editButton, toggleButton);
    row.classList.toggle("text-muted", item.active === false);
    row.append(idCell, labelCell, statusCell, actions);
    return row;
  });
  tbody.replaceChildren(...rows);
};

const renderAllReferenceTables = () => referenceSections.forEach(section => renderReferenceTable(section.type));

const resetReferenceForm = type => {
  const pane = document.querySelector(`[data-reference-type="${type}"]`);
  if (!pane) return;
  pane.querySelector('[data-reference-field="id"]').value = "";
  const idInput = pane.querySelector('[data-reference-field="newId"]');
  idInput.value = "";
  idInput.disabled = false;
  pane.querySelector('[data-reference-field="label"]').value = "";
  document.getElementById("referenceDataError").hidden = true;
};

const fillReferenceForm = (type, item) => {
  const pane = document.querySelector(`[data-reference-type="${type}"]`);
  if (!pane) return;
  pane.querySelector('[data-reference-field="id"]').value = item.id;
  const idInput = pane.querySelector('[data-reference-field="newId"]');
  idInput.value = item.id;
  idInput.disabled = true;
  pane.querySelector('[data-reference-field="label"]').value = item.label;
  document.getElementById("referenceDataError").hidden = true;
};

const openReferenceDataModal = async () => {
  const errorElement = document.getElementById("referenceDataError");
  try {
    errorElement.hidden = true;
    buildReferenceDataAdmin();
    await loadReferenceAdminData();
    renderAllReferenceTables();
    referenceDataModal.show();
  } catch (error) {
    errorElement.textContent = error.message || "Stammdaten konnten nicht geladen werden.";
    errorElement.hidden = false;
    referenceDataModal.show();
  }
};

const refreshReferenceDataAfterSave = async () => {
  await loadReferenceData();
  await loadReferenceAdminData();
  buildMemberForm();
  refreshAllViews();
  renderAllReferenceTables();
};

const handleReferenceFormSubmit = async (event, type) => {
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
    if (id) {
      await updateReferenceItemViaApi(type, item);
    } else {
      await createReferenceItemViaApi(type, item);
    }
    resetReferenceForm(type);
    await refreshReferenceDataAfterSave();
  } catch (error) {
    errorElement.textContent = error.message || "Stammdaten konnten nicht gespeichert werden.";
    errorElement.hidden = false;
  }
};

const toggleReferenceItem = async (type, item) => {
  const errorElement = document.getElementById("referenceDataError");
  try {
    errorElement.hidden = true;
    if (item.active === false) {
      await updateReferenceItemViaApi(type, { id: item.id, label: item.label, active: true });
    } else {
      await deleteReferenceItemViaApi(type, item.id);
    }
    resetReferenceForm(type);
    await refreshReferenceDataAfterSave();
  } catch (error) {
    errorElement.textContent = error.message || "Stammdatensatz konnte nicht aktualisiert werden.";
    errorElement.hidden = false;
  }
};

const wireUi = () => {
  document.getElementById("addMemberBtn").addEventListener("click", () => openMemberModal(null));
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("changePasswordBtn").addEventListener("click", openOwnPasswordChangeModal);
  document.getElementById("manageUsersBtn").addEventListener("click", openUserAdminModal);
  document.getElementById("manageReferenceDataBtn").addEventListener("click", openReferenceDataModal);
  document.getElementById("userForm").addEventListener("submit", handleUserFormSubmit);
  document.getElementById("resetUserFormBtn").addEventListener("click", resetUserForm);
  document.getElementById("metricClubOpenBtn").addEventListener("click", showOpenClubPayments);
  document.getElementById("togglePaymentComputerGroupsBtn").addEventListener("click", togglePaymentComputerGroups);
  document.getElementById("togglePaymentClubOpenBtn").addEventListener("click", togglePaymentClubOpen);
  document.getElementById("refreshRecentChangesBtn").addEventListener("click", refreshRecentChanges);
  document.getElementById("memberForm").addEventListener("submit", handleMemberSubmit);
  document.getElementById("globalSearchInput").addEventListener("input", event => applyQuickFilter(event.target.value.trim()));
  document.getElementById("clearAllFiltersBtn").addEventListener("click", clearAllFilters);
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  updateGlobalSearchVisibility();

  document.querySelectorAll('#mainTabs button[data-bs-toggle="tab"]').forEach(tabButton => {
    tabButton.addEventListener("shown.bs.tab", event => {
      updateGlobalSearchVisibility(event.target.dataset.bsTarget);
      if (event.target.dataset.bsTarget === "#changes-pane") {
        refreshRecentChanges();
      }
      setTimeout(() => {
        Object.entries(gridApis).forEach(([gridKey, api]) => fitGridColumnsIfNeeded(gridKey, api));
      }, 10);
    });
  });

  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  if (localStorage.getItem("sidebar-collapsed") === "true") sidebar.classList.add("sidebar--collapsed");
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("sidebar--collapsed");
    localStorage.setItem("sidebar-collapsed", sidebar.classList.contains("sidebar--collapsed"));
    setTimeout(() => Object.entries(gridApis).forEach(([k, api]) => fitGridColumnsIfNeeded(k, api)), 230);
  });

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

const createGrid = (gridKey, containerId, columnDefs, overrides = {}) => {
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
    onColumnMoved: event => saveGridColumnState(gridKey, event.api),
    onColumnPinned: event => saveGridColumnState(gridKey, event.api),
    onColumnResized: event => {
      if (event.finished) saveGridColumnState(gridKey, event.api);
    },
    onColumnVisible: event => saveGridColumnState(gridKey, event.api),
    onSortChanged: event => saveGridColumnState(gridKey, event.api),
    onRowDoubleClicked: event => openMemberModal(event.data.id),
    ...overrides
  };

  const api = agGrid.createGrid(gridDiv, options);
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
  { headerName: "Geburtstag", field: "geburtstag", valueFormatter: dateFormatter, filter: "agDateColumnFilter", filterParams: { comparator: compareIsoDateToFilterDate, inRangeInclusive: true }, minWidth: 140 },
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
  { headerName: "Geburtstag", field: "geburtstag", valueFormatter: dateFormatter, filter: "agDateColumnFilter", filterParams: { comparator: compareIsoDateToFilterDate, inRangeInclusive: true }, minWidth: 140 },
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
    button.addEventListener("click", () => openMemberModal(params.data.id));
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
    row.className = section.groups ? "member-payment-groups" : "row g-3";

    if (section.id === "basis") {
      pane.appendChild(createMemberPhotoPreview());
    }

    if (section.groups) {
      section.groups.forEach(group => {
        row.appendChild(createMemberFormGroup(group, fieldByKey));
      });
    } else {
      section.fieldKeys.forEach(fieldKey => {
        const field = fieldByKey.get(fieldKey);
        if (field) {
          row.appendChild(createMemberFormField(field));
        }
      });
    }

    tabItem.appendChild(tabButton);
    tabs.appendChild(tabItem);
    pane.appendChild(row);
    tabContent.appendChild(pane);
  });

  const changesTabItem = document.createElement("li");
  changesTabItem.className = "nav-item";
  changesTabItem.role = "presentation";

  const changesTabButton = document.createElement("button");
  changesTabButton.className = "nav-link";
  changesTabButton.id = "member-form-changes-tab";
  changesTabButton.type = "button";
  changesTabButton.role = "tab";
  changesTabButton.dataset.bsToggle = "tab";
  changesTabButton.dataset.bsTarget = "#member-form-changes-pane";
  changesTabButton.setAttribute("aria-controls", "member-form-changes-pane");
  changesTabButton.setAttribute("aria-selected", "false");
  changesTabButton.textContent = "Änderungen";

  const changesPane = document.createElement("div");
  changesPane.className = "tab-pane fade";
  changesPane.id = "member-form-changes-pane";
  changesPane.role = "tabpanel";
  changesPane.setAttribute("aria-labelledby", changesTabButton.id);
  changesPane.tabIndex = 0;

  const changesContainer = document.createElement("div");
  changesContainer.className = "member-change-history";
  changesContainer.id = "memberChangeHistory";
  changesPane.appendChild(changesContainer);

  changesTabItem.appendChild(changesTabButton);
  tabs.appendChild(changesTabItem);
  tabContent.appendChild(changesPane);

  container.append(hiddenIdInput, tabs, tabContent);
};

const createMemberFormGroup = (group, fieldByKey) => {
  const wrapper = document.createElement("section");
  wrapper.className = "member-form-group";
  if (group.visibleWhen) {
    wrapper.dataset.visibleWhen = group.visibleWhen;
  }

  const title = document.createElement("h3");
  title.className = "member-form-group__title";
  title.textContent = group.label;

  const fields = document.createElement("div");
  fields.className = "row g-3";

  group.fieldKeys.forEach(fieldKey => {
    const field = fieldByKey.get(fieldKey);
    if (field) {
      fields.appendChild(createMemberFormField(field));
    }
  });

  wrapper.append(title, fields);
  return wrapper;
};

const createMemberFormField = field => {
  const col = document.createElement("div");
  col.dataset.fieldKey = field.key;
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
    if (paidAmountDefaults[field.key]) {
      input.addEventListener("change", () => applyPaidAmountDefault(field.key));
    }

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
    input.size = ["interessengruppen", "funktion"].includes(field.key) ? 8 : Math.min(6, field.options.length);
    if (field.key === "interessengruppen") {
      input.addEventListener("change", updateInterestGroupDisplayField);
    } else if (field.key === "funktion") {
      input.addEventListener("change", updateFunctionDisplayField);
    }
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

  if (field.key === "gruppenwahl") {
    input.addEventListener("change", updateConditionalMemberFormGroups);
  }

  col.append(label, input);
  if (field.key === "interessengruppen") {
    col.appendChild(createInterestGroupDisplayField());
  } else if (field.key === "funktion") {
    col.appendChild(createFunctionDisplayField());
  }
  return col;
};

const createInterestGroupDisplayField = () => {
  const display = document.createElement("input");
  display.type = "text";
  display.id = "field-interessengruppen-display";
  display.className = "form-control member-form-selection-display";
  display.readOnly = true;
  display.tabIndex = -1;
  display.setAttribute("aria-label", "Ausgewählte Interessengruppen");
  return display;
};

const updateInterestGroupDisplayField = () => {
  const display = document.getElementById("field-interessengruppen-display");
  const input = document.getElementById("field-interessengruppen");
  if (!display || !input) return;

  const groupIds = Array.from(input.selectedOptions).map(option => Number(option.value));
  display.value = formatInterestGroups(groupIds);
};

const createFunctionDisplayField = () => {
  const display = document.createElement("input");
  display.type = "text";
  display.id = "field-funktion-display";
  display.className = "form-control member-form-selection-display";
  display.readOnly = true;
  display.tabIndex = -1;
  display.setAttribute("aria-label", "Ausgewählte Funktionen");
  return display;
};

const updateFunctionDisplayField = () => {
  const display = document.getElementById("field-funktion-display");
  const input = document.getElementById("field-funktion");
  if (!display || !input) return;

  const functionIds = Array.from(input.selectedOptions).map(option => Number(option.value));
  display.value = formatFunctions(functionIds);
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

  const fileInput = document.createElement("input");
  fileInput.className = "member-photo-preview__input";
  fileInput.id = "memberPhotoUploadInput";
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp";
  fileInput.addEventListener("change", handleMemberPhotoSelection);

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "btn btn-outline-secondary btn-sm member-photo-preview__button";
  uploadLabel.setAttribute("for", fileInput.id);
  uploadLabel.textContent = "Passfoto wählen";

  text.append(title, uploadLabel, fileInput);
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
  clearSelectedMemberPhoto();
  fillMemberForm(member, isNew);
  loadMemberChangeHistory(member.id, isNew);
  resetMemberFormTabs();
  memberModal.show();
};

const loadMemberChangeHistory = async (memberId, isNew) => {
  if (isNew) {
    renderMemberChangeHistory([], { message: "Änderungen werden nach dem ersten Speichern protokolliert." });
    return;
  }

  renderMemberChangeHistory([], { message: "Änderungsverlauf wird geladen..." });
  try {
    renderMemberChangeHistory(await loadMemberChangesViaApi(memberId));
  } catch (error) {
    console.warn("Änderungsverlauf konnte nicht geladen werden.", error);
    renderMemberChangeHistory([], { message: "Änderungsverlauf konnte nicht geladen werden." });
  }
};

const memberChangeActionLabel = action => ({
  created: "Mitglied angelegt",
  updated: "Mitglied geändert",
  deleted: "Mitglied gelöscht",
  photo_updated: "Passbild geändert",
  photo_deleted: "Passbild entfernt"
}[action] || "Änderung");

const legacyHiddenMemberChangeFields = new Set(["preisClub", "preisComputer", "preisWeihnachten"]);
const legacyHiddenMemberChangeLabels = new Set(["Preis Club", "Preis Computer", "Preis Weihnachten"]);
const isVisibleMemberChange = change => !legacyHiddenMemberChangeFields.has(change.field)
  && !legacyHiddenMemberChangeLabels.has(change.label)
  && String(change.old ?? "").trim() !== String(change.new ?? "").trim();
const visibleMemberChanges = changes => Array.isArray(changes)
  ? changes.filter(isVisibleMemberChange)
  : [];

const renderMemberChangeHistory = (items, { message = "" } = {}) => {
  const container = document.getElementById("memberChangeHistory");
  if (!container) return;
  container.innerHTML = "";

  if (message || !items.length) {
    const empty = document.createElement("div");
    empty.className = "member-change-history__empty";
    empty.textContent = message || "Noch keine Änderungen protokolliert.";
    container.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const entry = document.createElement("article");
    entry.className = "member-change-entry";

    const header = document.createElement("div");
    header.className = "member-change-entry__header";

    const title = document.createElement("strong");
    title.textContent = memberChangeActionLabel(item.action);

    const meta = document.createElement("span");
    const changedBy = item.changedByName ? ` · ${item.changedByName}` : "";
    meta.textContent = `${formatDateTimeDE(item.changedAt)}${changedBy}`;

    header.append(title, meta);
    entry.appendChild(header);

    const changes = visibleMemberChanges(item.changes);
    if (changes.length) {
      const list = document.createElement("ul");
      list.className = "member-change-entry__list";
      changes.forEach(change => {
        const listItem = document.createElement("li");
        const oldValue = change.old || "leer";
        const newValue = change.new || "leer";
        listItem.textContent = `${change.label || change.field}: ${oldValue} -> ${newValue}`;
        list.appendChild(listItem);
      });
      entry.appendChild(list);
    }

    container.appendChild(entry);
  });
};

const refreshRecentChanges = async () => {
  const button = document.getElementById("refreshRecentChangesBtn");
  if (button) button.disabled = true;
  renderRecentChanges(state.recentChanges, { message: state.recentChanges.length ? "" : "\u00c4nderungen werden geladen..." });
  try {
    const payload = await loadRecentMemberChangesViaApi();
    state.recentChanges = Array.isArray(payload?.changes) ? payload.changes : [];
    renderRecentChanges(state.recentChanges);
  } catch (error) {
    console.warn("Letzte Aenderungen konnten nicht geladen werden.", error);
    renderRecentChanges(state.recentChanges, { message: state.recentChanges.length ? "" : "Letzte \u00c4nderungen konnten nicht geladen werden." });
  } finally {
    if (button) button.disabled = false;
  }
};

const getRecentChangeMemberLabel = item => {
  const apiName = String(item.memberName || "").trim();
  if (apiName) return apiName;
  const member = findMemberById(Number(item.memberId));
  return member ? formatMemberName(member) : `Mitglied ${item.memberId}`;
};

const renderRecentChanges = (items, { message = "" } = {}) => {
  const container = document.getElementById("recentChangesList");
  if (!container) return;
  container.innerHTML = "";

  if (message || !items.length) {
    const empty = document.createElement("div");
    empty.className = "recent-change-list__empty";
    empty.textContent = message || "Noch keine \u00c4nderungen protokolliert.";
    container.appendChild(empty);
    return;
  }

  container.replaceChildren(...items.map(createRecentChangeEntry));
};

const createRecentChangeEntry = item => {
  const entry = document.createElement("article");
  entry.className = "recent-change-entry";

  const header = document.createElement("div");
  header.className = "recent-change-entry__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "recent-change-entry__title";

  const action = document.createElement("strong");
  action.textContent = memberChangeActionLabel(item.action);

  const memberButton = document.createElement("button");
  memberButton.className = "recent-change-entry__member";
  memberButton.type = "button";
  memberButton.textContent = getRecentChangeMemberLabel(item);
  memberButton.disabled = item.memberExists === false || !findMemberById(Number(item.memberId));
  memberButton.title = memberButton.disabled ? "Mitglied ist nicht mehr vorhanden" : "Mitglied \u00f6ffnen";
  memberButton.addEventListener("click", () => openMemberModal(Number(item.memberId)));

  const meta = document.createElement("span");
  const changedBy = item.changedByName ? ` - ${item.changedByName}` : "";
  meta.textContent = `${formatDateTimeDE(item.changedAt)}${changedBy}`;

  titleWrap.append(action, memberButton);
  header.append(titleWrap, meta);
  entry.appendChild(header);

  const changes = visibleMemberChanges(item.changes);
  if (changes.length) {
    const list = document.createElement("ul");
    list.className = "recent-change-entry__list";
    changes.forEach(change => {
      const listItem = document.createElement("li");
      const oldValue = change.old || "leer";
      const newValue = change.new || "leer";
      listItem.textContent = `${change.label || change.field}: ${oldValue} -> ${newValue}`;
      list.appendChild(listItem);
    });
    entry.appendChild(list);
  }

  return entry;
};

const resetMemberFormTabs = () => {
  const firstTab = document.querySelector("#memberFormTabs .nav-link");
  if (firstTab && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(firstTab).show();
  }
};

const ensureSelectHasValue = (input, raw) => {
  const value = raw === null || raw === undefined ? "" : String(raw);
  if (!value || Array.from(input.options).some(option => option.value === value)) return;

  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  input.appendChild(option);
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
      if (field.key === "interessengruppen") {
        updateInterestGroupDisplayField();
      } else if (field.key === "funktion") {
        updateFunctionDisplayField();
      }
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
      if (field.key === "gruppenwahl") {
        ensureSelectHasValue(input, raw);
      }
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
  updateConditionalMemberFormGroups(member);

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
  if (!previewImage) return;

  setFallbackPhoto(previewImage);
  previewImage.className = "member-photo-preview__image member-photo member-photo--fallback";

  if (selectedMemberPhotoFile && selectedMemberPhotoObjectUrl) {
    const image = document.createElement("img");
    image.className = "member-photo__image";
    image.alt = `Ausgewähltes Passfoto von ${formatMemberName(member)}`;
    previewImage.className = "member-photo-preview__image member-photo";
    previewImage.title = image.alt;
    previewImage.setAttribute("aria-label", image.alt);
    previewImage.replaceChildren(image);
    image.src = selectedMemberPhotoObjectUrl;
    return;
  }

  resolveMemberPhotoDataUrl(member).then(photoDataUrl => {
    if (!photoDataUrl) return;

    const image = document.createElement("img");
    image.className = "member-photo__image";
    image.alt = `Passfoto von ${formatMemberName(member)}`;
    image.addEventListener("error", () => {
      setFallbackPhoto(previewImage);
      previewImage.classList.add("member-photo-preview__image");
    }, { once: true });

    previewImage.className = "member-photo-preview__image member-photo";
    previewImage.title = image.alt;
    previewImage.setAttribute("aria-label", image.alt);
    previewImage.replaceChildren(image);
    image.src = photoDataUrl;
  }).catch(() => {
    // Fallback remains visible.
  });
};

const handleMemberPhotoSelection = event => {
  const file = event.target.files?.[0] || null;
  clearSelectedMemberPhoto();
  if (!file) {
    updateMemberPhotoPreview(readMemberPreviewFromForm());
    return;
  }

  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    window.alert("Bitte ein JPG-, PNG- oder WebP-Bild auswählen.");
    event.target.value = "";
    updateMemberPhotoPreview(readMemberPreviewFromForm());
    return;
  }

  selectedMemberPhotoFile = file;
  selectedMemberPhotoObjectUrl = URL.createObjectURL(file);
  updateMemberPhotoPreview(readMemberPreviewFromForm());
};

const clearSelectedMemberPhoto = () => {
  if (selectedMemberPhotoObjectUrl) {
    URL.revokeObjectURL(selectedMemberPhotoObjectUrl);
  }
  selectedMemberPhotoFile = null;
  selectedMemberPhotoObjectUrl = null;
  const input = document.getElementById("memberPhotoUploadInput");
  if (input) {
    input.value = "";
  }
};

const readMemberPreviewFromForm = () => ({
  name: document.getElementById("field-name")?.value || "",
  vorname: document.getElementById("field-vorname")?.value || "",
  passbild: ""
});

const readMemberGroupStatusFromForm = () => ({
  gruppenwahl: document.getElementById("field-gruppenwahl")?.value || ""
});

const updateConditionalMemberFormGroups = member => {
  const formMember = member || readMemberGroupStatusFromForm();
  document.querySelectorAll("[data-visible-when='computerGroupMember']").forEach(group => {
    group.hidden = !isComputerGroupMember(formMember);
  });
};

const handleMemberSubmit = async event => {
  event.preventDefault();

  let formData = readMemberFromForm();
  if (!formData.name || !formData.vorname) {
    window.alert("Name und Vorname sind Pflichtfelder.");
    return;
  }

  if (state.editingId === null) {
    if (state.members.some(member => member.id === formData.id)) {
      window.alert(`Die ID ${formData.id} existiert bereits. Bitte eine andere ID wählen.`);
      return;
    }
    try {
      formData = await createMemberViaApi(formData);
    } catch (error) {
      console.warn("Mitglied konnte nicht angelegt werden.", error);
      window.alert("Speichern in der Datenbank fehlgeschlagen.");
      return;
    }
    try {
      formData = await uploadSelectedMemberPhotoIfNeeded(formData);
    } catch {
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
    try {
      formData = await updateMemberViaApi(formData);
    } catch (error) {
      console.warn("Mitglied konnte nicht gespeichert werden.", error);
      window.alert("Speichern in der Datenbank fehlgeschlagen.");
      return;
    }
    try {
      formData = await uploadSelectedMemberPhotoIfNeeded(formData);
    } catch {
      return;
    }
    state.members[index] = formData;
  }

  state.members.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "de");
    if (byName !== 0) {
      return byName;
    }
    return a.vorname.localeCompare(b.vorname, "de");
  });
  clearSelectedMemberPhoto();
  memberModal.hide();
  refreshAllViews();
  refreshRecentChanges();
};

const uploadSelectedMemberPhotoIfNeeded = async member => {
  if (!selectedMemberPhotoFile) return member;

  try {
    const photo = await uploadMemberPhotoViaApi(member.id, selectedMemberPhotoFile);
    return {
      ...member,
      passbild: photo.fileName || member.passbild,
      hasPassbildInDb: true
    };
  } catch (error) {
    console.warn("Passfoto konnte nicht hochgeladen werden.", error);
    window.alert("Passfoto konnte nicht hochgeladen werden.");
    throw error;
  }
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
const isOpenClubPaymentMember = member => !isGuestMember(member) && !asBoolean(member.beitragClubBezahlt);
const normalizeGroupText = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const isComputerGroupMember = member => computerGroupPatterns.some(pattern => normalizeGroupText(member?.gruppenwahl).includes(pattern));

const togglePaymentComputerGroups = () => {
  if (state.showOnlyOpenClubPayments) state.showOnlyOpenClubPayments = false;
  state.showOnlyPaymentComputerGroups = !state.showOnlyPaymentComputerGroups;
  updatePaymentComputerGroupToggle();
  updatePaymentClubOpenToggle();
  refreshAllViews();
};

const togglePaymentClubOpen = () => {
  const shouldShowOpenOnly = !state.showOnlyOpenClubPayments;
  state.showOnlyOpenClubPayments = shouldShowOpenOnly;
  if (shouldShowOpenOnly) {
    state.showOnlyPaymentComputerGroups = false;
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
  bootstrap.Tab.getOrCreateInstance(paymentsTab).show();
};

const updatePaymentComputerGroupToggle = () => {
  const button = document.getElementById("togglePaymentComputerGroupsBtn");
  button.textContent = state.showOnlyPaymentComputerGroups ? "Alle Gruppen anzeigen" : "Nur Computergruppen";
  button.setAttribute("aria-pressed", String(state.showOnlyPaymentComputerGroups));
  button.classList.toggle("active", state.showOnlyPaymentComputerGroups);
};
const updatePaymentClubOpenToggle = () => {
  const button = document.getElementById("togglePaymentClubOpenBtn");
  button.textContent = state.showOnlyOpenClubPayments ? "Alle Club-Beitraege" : "Nur Club offen";
  button.setAttribute("aria-pressed", String(state.showOnlyOpenClubPayments));
  button.classList.toggle("active", state.showOnlyOpenClubPayments);
};
const filterPaymentMembers = members => {
  if (state.showOnlyOpenClubPayments) return members.filter(isOpenClubPaymentMember);
  return state.showOnlyPaymentComputerGroups ? members.filter(isComputerGroupMember) : members;
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

  const historicalMembers = [...state.members]
    .filter(m => !isActiveMember(m) && !isGuestMember(m))
    .sort(sortByName);
  setGridData(gridApis.historical, historicalMembers);

  refreshDashboard();

  applyQuickFilter(document.getElementById("globalSearchInput").value.trim());

  Object.entries(gridApis).forEach(([gridKey, api]) => fitGridColumnsIfNeeded(gridKey, api));
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
  if (overviewTab && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(overviewTab).show();
  }
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

const refreshDashboard = () => {
  const activeMembers = state.members.filter(isActiveMember);
  const clubMembers = activeMembers.filter(member => !isGuestMember(member));
  const total = clubMembers.length;
  const guests = activeMembers.filter(isGuestMember).length;
  const clubPaid = clubMembers.filter(member => asBoolean(member.beitragClubBezahlt)).length;
  const openClubPayments = activeMembers.filter(isOpenClubPaymentMember);
  const computerMembers = clubMembers.filter(isComputerGroupMember);
  const computerTotal = computerMembers.length;
  const computerPaid = computerMembers.filter(member => asBoolean(member.beitragComputerBezahlt)).length;

  setText("metricTotal", String(total));
  setText("metricGuestCount", String(guests));
  setText("metricClubPaid", `${clubPaid} (${percent(clubPaid, total)}%)`);
  setText("metricComputerTotal", String(computerTotal));
  setText("metricComputerPaid", `${computerPaid} (${percent(computerPaid, computerTotal)}%)`);

  const clubOpen = openClubPayments.length;
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
    ...Array.from({ length: 8 }, (_, index) => {
      const min = 55 + index * 5;
      return { label: `${min}-${min + 4}`, min, max: min + 4, count: 0 };
    }),
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
      onClick: (_event, elements) => {
        const index = elements?.[0]?.index;
        if (Number.isInteger(index)) showOverviewForAgeBucket(buckets[index]);
      },
      onHover: (event, elements) => {
        if (event?.native?.target) event.native.target.style.cursor = elements?.length ? "pointer" : "default";
      },
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
      onClick: (_event, elements) => {
        const index = elements?.[0]?.index;
        if (Number.isInteger(index)) showOverviewForInterestGroup(groups[index]);
      },
      onHover: (event, elements) => {
        if (event?.native?.target) event.native.target.style.cursor = elements?.length ? "pointer" : "default";
      },
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
  member.ort = "Berlin";
  member.clubzugehoerigkeit = MEMBER_CLUB_ID;
  return member;
};

const dateFormatter = params => formatDateDE(params.value);
const currencyFormatter = params => formatCurrency(params.value);
const interestGroupFormatter = params => formatInterestGroups(params.value);
const christmasFormatter = params => christmasChoiceMap[Number(params.value)] || christmasChoiceMap[0];

const compareIsoDateToFilterDate = (filterDate, cellValue) => {
  const cellDate = parseIsoDate(cellValue);
  if (!cellDate) return -1;
  const filter = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
  if (cellDate < filter) return -1;
  if (cellDate > filter) return 1;
  return 0;
};

const formatInterestGroups = groupIds => !groupIds || groupIds.length === 0 ? "" : groupIds.map(id => interestGroupMap[id] || `ID ${id}`).join(", ");

const formatFunctions = functionIds => !functionIds || functionIds.length === 0 ? "" : functionIds.map(id => funktionsMap[id] || `ID ${id}`).join(", ");

const formatDateDE = isoDate => {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.split("-");
  return parts.length !== 3 ? isoDate : `${parts[2]}.${parts[1]}.${parts[0]}`;
};

const formatDateTimeDE = value => {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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

const parseLegacyCashAmount = (cashValue, paidValue) => {
  const parsedCashValue = parseLegacyCurrency(cashValue);
  return parsedCashValue === -1 ? parseLegacyCurrency(paidValue) : parsedCashValue;
};

const asBoolean = value => {
  if (value === true || value === 1 || value === -1) return true;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return ["true", "1", "-1", "yes"].includes(lower);
  }
  return false;
};

const parseIsoDate = isoDate => {
  if (!isoDate || typeof isoDate !== "string") return null;
  const parts = isoDate.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const calculateAge = (isoDate, today = new Date()) => {
  const birthDate = parseIsoDate(isoDate);
  if (!birthDate) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const getBirthDateRangeForAgeBucket = (bucket, today = new Date()) => {
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const to = new Date(currentDay.getFullYear() - bucket.min, currentDay.getMonth(), currentDay.getDate());
  if (!Number.isFinite(bucket.max)) {
    return { from: "1900-01-01", to: formatIsoDate(to) };
  }

  const from = new Date(currentDay.getFullYear() - bucket.max - 1, currentDay.getMonth(), currentDay.getDate() + 1);
  return { from: formatIsoDate(from), to: formatIsoDate(to) };
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
  if (member?.id && member.hasPassbildInDb) {
    return fetchMemberPhotoObjectUrl(member.id);
  }
  return null;
};

const normalizePhotoFileName = value => {
  const fileName = String(value || "").trim().split(/[\\/]/).filter(Boolean).pop() || "";
  return /\.(jpe?g|png)$/i.test(fileName) ? fileName : "";
};

const loadStoredMembers = async () => {
  try {
    return await loadMembersFromApi();
  } catch (error) {
    console.warn("Mitgliederdaten konnten nicht ueber die API geladen werden.", error);
    return null;
  }
};

const createMemberApiUrl = (path, params = {}) => {
  return createMemberApiUrlForBase(memberApiBaseUrl, path, params);
};

const getMemberApiBaseUrlCandidates = () => {
  const candidates = [memberApiBaseUrl, DEFAULT_MEMBER_API_BASE_URL];
  if (window.location.protocol.startsWith("http")) {
    candidates.push(new URL(PHP_MEMBER_API_BASE_PATH, window.location.origin).toString());
  }
  return [...new Set(candidates)];
};

const createMemberApiUrlForBase = (baseUrl, path, params = {}) => {
  const url = new URL(baseUrl);
  const normalizedPath = path.replace(/^\/+/, "");
  if (url.pathname.endsWith(".php")) {
    url.pathname = `${url.pathname}/${normalizedPath}`;
  } else {
    const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/${normalizedPath}`;
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

const requestMemberApi = async (path, { method = "GET", params = {}, body = null, requiresAuth = true, authToken = "" } = {}) => {
  const options = { method, headers: {} };
  const token = authToken || state.authToken;
  if (requiresAuth && token) {
    options.headers.Authorization = `Bearer ${token}`;
  }
  if (body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  let lastNetworkError = null;
  let lastApiFallbackResponse = null;
  for (const baseUrl of getMemberApiBaseUrlCandidates()) {
    try {
      const candidateResponse = await fetch(createMemberApiUrlForBase(baseUrl, path, params), options);
      const contentType = candidateResponse.headers.get("content-type") || "";
      if (path.startsWith("/api/") && candidateResponse.status !== 204 && ([404, 405].includes(candidateResponse.status) || !contentType.includes("application/json"))) {
        lastApiFallbackResponse = candidateResponse;
        continue;
      }
      response = candidateResponse;
      memberApiBaseUrl = baseUrl;
      break;
    } catch (error) {
      lastNetworkError = error;
    }
  }
  if (!response && lastApiFallbackResponse) {
    response = lastApiFallbackResponse;
  }
  if (!response) {
    throw lastNetworkError || new Error("API nicht erreichbar.");
  }
  if (response.status === 204) return null;

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("API hat kein JSON geliefert. Bitte API-Adresse pruefen.");
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `API-Fehler ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
};

const loadMembersFromApi = async () => {
  const members = [];
  for (let offset = 0; ; offset += MEMBER_API_PAGE_SIZE) {
    const payload = await requestMemberApi("/api/members", {
      params: { limit: MEMBER_API_PAGE_SIZE, offset }
    });
    const page = Array.isArray(payload?.members) ? payload.members : [];
    members.push(...page);
    if (page.length < MEMBER_API_PAGE_SIZE) {
      break;
    }
  }
  return members.map(normalizeMember);
};

const toMemberApiPayload = member => {
  if (!member || typeof member !== "object") return member;
  return Object.fromEntries(fieldDefinitions.map(field => [field.key, member[field.key]]));
};

const createMemberViaApi = async member => {
  const payload = await requestMemberApi("/api/members", { method: "POST", body: toMemberApiPayload(member) });
  return normalizeMember(payload.member);
};

const loadMemberChangesViaApi = async memberId => {
  const payload = await requestMemberApi(`/api/members/${memberId}/changes`);
  return Array.isArray(payload?.changes) ? payload.changes : [];
};

const fetchMemberPhotoObjectUrl = async memberId => {
  const response = await fetch(createMemberApiUrl(`/api/members/${memberId}/photo`), {
    headers: { Authorization: `Bearer ${state.authToken}` }
  });
  if (!response.ok) return null;
  return URL.createObjectURL(await response.blob());
};

const uploadMemberPhotoViaApi = async (memberId, file) => {
  const response = await fetch(createMemberApiUrl(`/api/members/${memberId}/photo`), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${state.authToken}`,
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name)
    },
    body: file
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || `API-Fehler ${response.status}`);
  }
  return payload.photo;
};

const updateMemberViaApi = async member => {
  const payload = await requestMemberApi(`/api/members/${member.id}`, { method: "PUT", body: toMemberApiPayload(member) });
  return normalizeMember(payload.member);
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
  clone.betragClubBar = parseLegacyCashAmount(clone.betragClubBar, clone.gezahlterBetragClub);
  clone.beitragComputerBezahlt = asBoolean(clone.beitragComputerBezahlt);
  clone.betragComputerBar = parseLegacyCashAmount(clone.betragComputerBar, clone.gezahlterBetragComputer);
  clone.gezahlterBetragClub = parseLegacyCurrency(clone.gezahlterBetragClub);
  clone.einzahlungClubAm = parseLegacyDate(clone.einzahlungClubAm);
  clone.gezahlterBetragComputer = parseLegacyCurrency(clone.gezahlterBetragComputer);
  clone.einzahlungComputerAm = parseLegacyDate(clone.einzahlungComputerAm);
  clone.gezahlterBetragWeihnachten = parseLegacyCurrency(clone.gezahlterBetragWeihnachten);
  clone.bemerkung = clone.bemerkung || "";
  clone.tischnummer = Number(clone.tischnummer) || 0;

  return clone;
}

const cloneMember = member => !member ? null : JSON.parse(JSON.stringify(member));
const getNextId = members => members.reduce((max, member) => Math.max(max, member.id), 0) + 1;
