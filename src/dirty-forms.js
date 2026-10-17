// Ungespeicherte Eingaben erkennen und vor dem Verlassen einer Maske nachfragen (Muster aus dem
// Gratulationsdienst). Beim Oeffnen bzw. Fuellen merkt sich jede Maske einen Schnappschuss ihrer
// Feldwerte; "dirty" ist sie, solange die aktuellen Werte davon abweichen - wer eine Aenderung
// zuruecktippt, wird also nicht mehr gefragt. Kommt ohne Bootstrap aus, damit es unit-testbar bleibt.

const IGNORED_TYPES = new Set(["button", "submit", "reset", "fieldset", "output"]);

const fieldKey = field => field.name || field.dataset?.fieldKey || field.dataset?.referenceField || field.id || "";

const fieldValue = field => {
  if (field.type === "checkbox" || field.type === "radio") return field.checked;
  if (field.type === "select-multiple") return [...field.options].filter(option => option.selected).map(option => option.value);
  return field.value;
};

// Abgeschaltete Felder, Knoepfe und Felder ohne Namen (z.B. "Name der neuen Kategorie") zaehlen nicht mit.
export const formSignature = form => JSON.stringify([...form.elements]
  .filter(field => !field.disabled && !IGNORED_TYPES.has(field.type) && fieldKey(field))
  .map(field => [fieldKey(field), fieldValue(field)]));

export const DISCARD_QUESTION = {
  title: "Ungespeicherte Änderungen",
  text: "Die Maske enthält Änderungen, die noch nicht gespeichert sind. Änderungen verwerfen und fortfahren?",
  confirmLabel: "Änderungen verwerfen",
  danger: true
};

export const createDirtyForms = ({ confirm }) => {
  // Je Formular: gemerkter Stand, optional eine eigene Erkennung (Mitgliedsmaske) und was "Verwerfen" tut
  const entries = new Map();

  const contains = (root, form) => !root || root === form || root.contains(form);
  const formsIn = root => [...entries.keys()].filter(form => contains(root, form));

  const markClean = form => {
    const entry = entries.get(form);
    if (entry) entry.baseline = formSignature(form);
  };

  const register = (form, { isDirty, discard } = {}) => {
    if (!form) return;
    entries.set(form, { baseline: "", isDirty, discard });
    markClean(form);
  };

  // Fuer Formulare, die aus der Seite verschwinden (z.B. ein geloeschtes Event)
  const unregister = form => entries.delete(form);

  const isDirty = form => {
    const entry = entries.get(form);
    if (!entry) return false;
    return entry.isDirty ? entry.isDirty() : entry.baseline !== formSignature(form);
  };

  // Ohne root alle angemeldeten Formulare, sonst nur die darin (z.B. in einem Dialog)
  const dirtyForms = root => formsIn(root).filter(isDirty);
  const hasDirty = root => dirtyForms(root).length > 0;

  const discard = forms => forms.forEach(form => {
    entries.get(form)?.discard?.();
    markClean(form);
  });

  // Fuehrt proceed sofort aus, wenn in root nichts offen ist - sonst erst nach "Änderungen verwerfen".
  const confirmLeave = async (root, proceed) => {
    const dirty = dirtyForms(root);
    if (dirty.length && !await confirm(DISCARD_QUESTION)) return false;
    discard(dirty);
    await proceed?.();
    return true;
  };

  // Bootstrap-Dialog: beim Oeffnen (die Felder sind dann schon gefuellt) den Stand merken, beim
  // Schliessen per Kreuz, Abbrechen, Esc oder Klick daneben nachfragen. hide schliesst nach "Verwerfen".
  const guardModal = (modalElement, hide) => {
    if (!modalElement) return;
    modalElement.addEventListener("show.bs.modal", event => {
      if (event.target === modalElement) formsIn(modalElement).forEach(markClean);
    });
    modalElement.addEventListener("hide.bs.modal", event => {
      if (event.target !== modalElement || !hasDirty(modalElement)) return;
      event.preventDefault();
      // Erst nach dem Tastendruck fragen: Esc wuerde die gerade geoeffnete Rueckfrage sonst gleich wieder schliessen.
      setTimeout(() => confirmLeave(modalElement, hide));
    });
  };

  return { confirmLeave, dirtyForms, guardModal, hasDirty, isDirty, markClean, register, unregister };
};
