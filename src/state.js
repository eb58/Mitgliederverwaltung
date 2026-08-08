const AUTH_TOKEN_STORAGE_KEY = "mitgliederverwaltung:authToken";

export const state = {
  members: [],
  nextId: 1,
  editingId: null,
  showOnlyPaymentComputerGroups: false,
  showOnlyOpenClubPayments: false,
  recentChanges: [],
  currentUser: null,
  authToken: localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ""
};

export const recentChangesCache = { loaded: false, promise: null };

export const gridApis = {
  overview: null,
  payments: null,
  christmas: null,
  historical: null,
  guests: null
};

export { AUTH_TOKEN_STORAGE_KEY };
