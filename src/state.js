const AUTH_TOKEN_STORAGE_KEY = "mitgliederverwaltung:authToken";
// Schalter der Zahlungsuebersicht, im Browser gemerkt (geschrieben in app.js)
export const PAYMENT_TOGGLE_STORAGE_KEYS = { showOnlyPaymentComputerGroups: "payments-only-computer-groups", showOnlyOpenClubPayments: "payments-only-club-open" };

export const state = {
  members: [],
  editingId: null,
  showOnlyPaymentComputerGroups: localStorage.getItem(PAYMENT_TOGGLE_STORAGE_KEYS.showOnlyPaymentComputerGroups) === "true",
  showOnlyOpenClubPayments: localStorage.getItem(PAYMENT_TOGGLE_STORAGE_KEYS.showOnlyOpenClubPayments) === "true",
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
