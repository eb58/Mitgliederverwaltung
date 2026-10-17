import { describe, it } from "node:test";
import { expect } from "./assertions.js";

import { DISCARD_QUESTION, createDirtyForms, formSignature } from "../../src/dirty-forms.js";

const field = ({ name = "", id = "", type = "text", value = "", checked = false, disabled = false, dataset = {}, options } = {}) =>
  ({ name, id, type, value, checked, disabled, dataset, options });

// Minimaler Ersatz fuer ein <form>: elements plus contains() fuer die Suche "Formulare in diesem Dialog"
const form = fields => ({ elements: fields, contains: other => other === form });

// Minimaler Ersatz fuer ein Element mit addEventListener (Bootstrap-Dialog)
const modalElement = forms => {
  const listeners = {};
  return {
    addEventListener: (type, listener) => { listeners[type] = listener; },
    contains: candidate => forms.includes(candidate),
    fire(type, target = this) {
      const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners[type]?.(event);
      return event;
    }
  };
};

const answering = answer => {
  const questions = [];
  return { questions, confirm: async question => { questions.push(question); return answer; } };
};

describe("formSignature", () => {
  it("nimmt Name, data-field-key, data-reference-field oder id als Schluessel", () => {
    const signature = formSignature(form([
      field({ name: "name", value: "Anna" }),
      field({ dataset: { fieldKey: "plz" }, value: "13469" }),
      field({ dataset: { referenceField: "label" }, value: "Kegeln" }),
      field({ id: "userRole", value: "admin" })
    ]));
    expect(JSON.parse(signature)).toEqual([["name", "Anna"], ["plz", "13469"], ["label", "Kegeln"], ["userRole", "admin"]]);
  });

  it("uebergeht Knoepfe, abgeschaltete Felder und Felder ohne Schluessel", () => {
    const signature = formSignature(form([
      field({ name: "ok", type: "submit", value: "Speichern" }),
      field({ name: "newId", value: "7", disabled: true }),
      field({ value: "neue Kategorie" }),
      field({ name: "vorname", value: "Anna" })
    ]));
    expect(JSON.parse(signature)).toEqual([["vorname", "Anna"]]);
  });

  it("vergleicht Haken und Mehrfachauswahl nach ihrem Zustand", () => {
    const signature = formSignature(form([
      field({ name: "favorit", type: "checkbox", checked: true }),
      field({ name: "gruppen", type: "select-multiple", options: [{ value: "1", selected: true }, { value: "2", selected: false }, { value: "3", selected: true }] })
    ]));
    expect(JSON.parse(signature)).toEqual([["favorit", true], ["gruppen", ["1", "3"]]]);
  });
});

describe("createDirtyForms", () => {
  it("ist nach dem Anmelden sauber und nach einer Aenderung dirty", () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(target);
    expect(dirtyForms.isDirty(target)).toBe(false);
    name.value = "Annette";
    expect(dirtyForms.isDirty(target)).toBe(true);
    expect(dirtyForms.hasDirty()).toBe(true);
  });

  it("wird wieder sauber, wenn die Aenderung zurueckgetippt ist", () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(target);
    name.value = "Annette";
    name.value = "Anna";
    expect(dirtyForms.isDirty(target)).toBe(false);
  });

  it("markClean uebernimmt den aktuellen Stand als neuen Ausgangspunkt", () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(target);
    name.value = "Berta";
    dirtyForms.markClean(target);
    expect(dirtyForms.isDirty(target)).toBe(false);
  });

  it("nutzt eine eigene Erkennung, wenn das Formular sie mitbringt", () => {
    let dirty = false;
    const target = form([field({ name: "name", value: "Anna" })]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(target, { isDirty: () => dirty });
    expect(dirtyForms.isDirty(target)).toBe(false);
    dirty = true;
    expect(dirtyForms.isDirty(target)).toBe(true);
  });

  it("schraenkt auf Formulare in einem Bereich ein", () => {
    const inside = field({ name: "name", value: "Anna" });
    const outside = field({ name: "name", value: "Berta" });
    const insideForm = form([inside]);
    const outsideForm = form([outside]);
    const dialog = modalElement([insideForm]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(insideForm);
    dirtyForms.register(outsideForm);
    outside.value = "Bertha";
    expect(dirtyForms.hasDirty(dialog)).toBe(false);
    expect(dirtyForms.dirtyForms()).toEqual([outsideForm]);
  });

  it("ignoriert Formulare, die es nicht gibt oder die nicht angemeldet sind", () => {
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(null);
    expect(dirtyForms.isDirty(form([]))).toBe(false);
    expect(dirtyForms.hasDirty()).toBe(false);
  });
});

describe("confirmLeave", () => {
  it("geht ohne Rueckfrage weiter, wenn nichts offen ist", async () => {
    const asked = answering(false);
    const dirtyForms = createDirtyForms(asked);
    dirtyForms.register(form([field({ name: "name", value: "Anna" })]));
    let proceeded = false;
    expect(await dirtyForms.confirmLeave(null, () => { proceeded = true; })).toBe(true);
    expect(proceeded).toBe(true);
    expect(asked.questions.length).toBe(0);
  });

  it("bleibt bei Abbrechen stehen und behaelt die Eingabe", async () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const asked = answering(false);
    const dirtyForms = createDirtyForms(asked);
    dirtyForms.register(target);
    name.value = "Annette";
    let proceeded = false;
    expect(await dirtyForms.confirmLeave(null, () => { proceeded = true; })).toBe(false);
    expect(proceeded).toBe(false);
    expect(asked.questions).toEqual([DISCARD_QUESTION]);
    expect(dirtyForms.isDirty(target)).toBe(true);
  });

  it("verwirft nach Bestaetigung und geht dann weiter", async () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dirtyForms = createDirtyForms(answering(true));
    let discarded = false;
    dirtyForms.register(target, { discard: () => { discarded = true; name.value = "Anna"; } });
    name.value = "Annette";
    let proceeded = false;
    expect(await dirtyForms.confirmLeave(target, () => { proceeded = true; })).toBe(true);
    expect(discarded).toBe(true);
    expect(proceeded).toBe(true);
    expect(dirtyForms.isDirty(target)).toBe(false);
  });
});

describe("guardModal", () => {
  it("merkt sich beim Oeffnen den gefuellten Stand", () => {
    const name = field({ name: "name", value: "" });
    const target = form([name]);
    const dialog = modalElement([target]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(target);
    dirtyForms.guardModal(dialog, () => {});
    name.value = "Anna";
    dialog.fire("show.bs.modal");
    expect(dirtyForms.isDirty(target)).toBe(false);
  });

  it("laesst einen sauberen Dialog ohne Rueckfrage schliessen", () => {
    const target = form([field({ name: "name", value: "Anna" })]);
    const dialog = modalElement([target]);
    const asked = answering(true);
    const dirtyForms = createDirtyForms(asked);
    dirtyForms.register(target);
    dirtyForms.guardModal(dialog, () => {});
    expect(dialog.fire("hide.bs.modal").defaultPrevented).toBe(false);
    expect(asked.questions.length).toBe(0);
  });

  it("haelt einen geaenderten Dialog auf und schliesst erst nach Verwerfen", async () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dialog = modalElement([target]);
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.register(target);
    let hidden = false;
    dirtyForms.guardModal(dialog, () => { hidden = true; });
    name.value = "Annette";
    expect(dialog.fire("hide.bs.modal").defaultPrevented).toBe(true);
    await new Promise(resolve => setTimeout(resolve));
    expect(hidden).toBe(true);
    expect(dirtyForms.isDirty(target)).toBe(false);
  });

  it("schliesst nach Abbrechen nicht", async () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dialog = modalElement([target]);
    const dirtyForms = createDirtyForms(answering(false));
    dirtyForms.register(target);
    let hidden = false;
    dirtyForms.guardModal(dialog, () => { hidden = true; });
    name.value = "Annette";
    dialog.fire("hide.bs.modal");
    await new Promise(resolve => setTimeout(resolve));
    expect(hidden).toBe(false);
    expect(dirtyForms.isDirty(target)).toBe(true);
  });

  it("reagiert nicht auf hochgereichte Ereignisse aus dem Inneren des Dialogs", () => {
    const name = field({ name: "name", value: "Anna" });
    const target = form([name]);
    const dialog = modalElement([target]);
    const asked = answering(true);
    const dirtyForms = createDirtyForms(asked);
    dirtyForms.register(target);
    dirtyForms.guardModal(dialog, () => {});
    name.value = "Annette";
    dialog.fire("show.bs.modal", target);
    expect(dirtyForms.isDirty(target)).toBe(true);
    expect(dialog.fire("hide.bs.modal", target).defaultPrevented).toBe(false);
    expect(asked.questions.length).toBe(0);
  });

  it("tut nichts ohne Dialogelement", () => {
    const dirtyForms = createDirtyForms(answering(true));
    dirtyForms.guardModal(null, () => {});
    expect(dirtyForms.hasDirty()).toBe(false);
  });
});
