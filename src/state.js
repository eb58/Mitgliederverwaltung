const AUTH_TOKEN_STORAGE_KEY = "mitgliederverwaltung:authToken";

export const state = {
  members: [],
  editingId: null,
  showOnlyPaymentComputerGroups: false,
  showOnlyOpenClubPayments: false,
  paymentMetricFilter: null,
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
  guests: null,
  warnemuende: null,
  eisbeinessen: null
};

export { AUTH_TOKEN_STORAGE_KEY };
