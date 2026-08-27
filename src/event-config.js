/**
 * Ein Event ist eine Teilnehmerliste mit eigener Tabelle, eigenem Tab und eigenem PDF.
 * `key` traegt alles: API-Pfad (`/api/<key>-participants`), DOM-Ids (`<key>Form`, `<key>Grid`, ...)
 * und den Schluessel des gespeicherten Spaltenzustands.
 */
export const eventConfigs = {
  warnemuende: { key: "warnemuende", label: "Warnemünde", mealOptions: ["Zander", "Rind", "Vegie"], maxSeats: 49 },
  eisbeinessen: { key: "eisbeinessen", label: "Eisbeinessen", mealOptions: [], maxSeats: 30 }
};

export const eventList = Object.values(eventConfigs);
