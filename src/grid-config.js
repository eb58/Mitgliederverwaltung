import { themeQuartz } from "ag-grid-community";

export const GRID_COLUMN_STATE_PREFIX = "mitgliederverwaltung:gridColumnState:";
export const searchableTabTargets = new Set([
  "#overview-pane",
  "#payments-pane",
  "#christmas-pane",
  "#historical-pane",
  "#guests-pane",
  "#warnemuende-pane",
  "#eisbeinessen-pane"
]);
export const gridApiByTabTarget = {
  "#overview-pane": "overview",
  "#payments-pane": "payments",
  "#christmas-pane": "christmas",
  "#historical-pane": "historical",
  "#guests-pane": "guests",
  "#warnemuende-pane": "warnemuende",
  "#eisbeinessen-pane": "eisbeinessen"
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
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--border)",
  browserColorScheme: "var(--app-color-scheme)",
  fontFamily: "Segoe UI, Noto Sans, sans-serif",
  headerBackgroundColor: "var(--grid-header-bg)",
  headerTextColor: "var(--grid-header-ink)",
  menuBackgroundColor: "var(--surface-2)",
  oddRowBackgroundColor: "var(--grid-odd-bg)",
  rowHoverColor: "var(--grid-hover-bg)",
  selectedRowBackgroundColor: "var(--grid-selected-bg)",
  wrapperBorderRadius: 16
});
