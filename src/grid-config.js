import { themeQuartz } from "ag-grid-community";

export const GRID_COLUMN_STATE_PREFIX = "mitgliederverwaltung:gridColumnState:";
export const searchableTabTargets = new Set([
  "#overview-pane",
  "#payments-pane",
  "#christmas-pane",
  "#historical-pane",
  "#guests-pane"
]);
export const gridApiByTabTarget = {
  "#overview-pane": "overview",
  "#payments-pane": "payments",
  "#christmas-pane": "christmas",
  "#historical-pane": "historical",
  "#guests-pane": "guests"
};

export const gridLocaleText = {
  page: "Seite",
  pageSizeSelectorLabel: "Seitengröße:",
  ariaPageSizeSelectorLabel: "Seitengröße",
  more: "mehr",
  to: "bis",
  of: "von",
  firstPage: "Erste Seite",
  previousPage: "Vorherige Seite",
  nextPage: "Nächste Seite",
  lastPage: "Letzte Seite",
  pageLastRowUnknown: "?",
  next: "Weiter",
  last: "Letzte",
  first: "Erste",
  previous: "Zurück",
  loadingOoo: "Lade...",
  noRowsToShow: "Keine Mitglieder gefunden",
  selectAll: "Alle auswählen",
  searchOoo: "Suchen...",
  blanks: "Leer",
  notBlank: "Nicht leer",
  filterOoo: "Filtern...",
  dateFormatOoo: "tt.mm.jjjj",
  equals: "Gleich",
  notEqual: "Ungleich",
  contains: "Enthält",
  notContains: "Enthält nicht",
  startsWith: "Beginnt mit",
  endsWith: "Endet mit",
  lessThan: "Kleiner als",
  lessThanOrEqual: "Kleiner oder gleich",
  greaterThan: "Größer als",
  greaterThanOrEqual: "Größer oder gleich",
  inRange: "Im Bereich",
  true: "Wahr",
  false: "Falsch",
  andCondition: "UND",
  orCondition: "ODER",
  applyFilter: "Anwenden",
  resetFilter: "Zurücksetzen",
  clearFilter: "Leeren",
  cancelFilter: "Abbrechen",
  ariaFilterInput: "Filtereingabe",
  ariaFilterMenuOpen: "Filtermenü öffnen",
  ariaDateFilterInput: "Datumsfiltereingabe"
};

export const createGridTheme = () => themeQuartz.withParams({
  accentColor: "#12807c",
  borderColor: "#d5e1de",
  browserColorScheme: "light",
  fontFamily: "Segoe UI, Noto Sans, sans-serif",
  headerBackgroundColor: "#e6f5f3",
  headerTextColor: "#143f44",
  oddRowBackgroundColor: "#f7fbfb",
  rowHoverColor: "#eaf7f5",
  selectedRowBackgroundColor: "#d8efe8",
  wrapperBorderRadius: 16
});
