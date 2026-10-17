import { Modal, Tab } from "bootstrap";
import { EVENT_SYMBOLS, archivedEvents, describeEvent, formatMealOptions, sortEvents, toEventPayload } from "./event-domain.js";
import { createEventView, eventIconSvg } from "./event-view.js";
import { gridApiByTabTarget, searchableTabTargets } from "./grid-config.js";
import { retryAsync } from "./member-utils.js";
import { gridApis } from "./state.js";
import { showToast } from "./ui.js";

/**
 * Events als Ganzes: laedt die Liste, baut je Event Navigationseintrag, Seite und Teilnehmerliste
 * (event-admin.js) auf und fuehrt den Dialog zum Anlegen und Bearbeiten sowie das Archiv.
 * Archivierte Events stehen nicht in der Navigation; ihre Liste laedt erst beim Oeffnen.
 */
export const createEventManager = ({ api, confirmAction, createAdmin, dirtyForms }) => {
  const entries = new Map();
  let events = [];
  let gridsReady = false;
  let settingsModal = null;
  let editing = null;

  const settingsForm = () => document.getElementById("eventSettingsForm");
  const archiveTab = () => document.getElementById("events-archive-tab");

  const setSettingsError = message => {
    const element = document.getElementById("eventSettingsError");
    element.textContent = message || "";
    element.hidden = !message;
  };

  const loadParticipants = entry => {
    entry.loaded = true;
    return entry.admin.load();
  };

  // Reihenfolge in der Navigation wie in der Liste: nach Datum, ohne Datum zuletzt
  const orderTabs = () => {
    const anchor = archiveTab();
    events.forEach(event => {
      const tab = entries.get(event.key)?.view.tab;
      if (tab) anchor.before(tab);
    });
  };

  const mount = event => {
    const view = createEventView(event);
    archiveTab().before(view.tab);
    document.getElementById("events-archive-pane").before(view.pane);
    document.body.append(view.modal);
    const admin = createAdmin(event, { editSettings: openSettings });
    const paneTarget = `#${view.pane.id}`;
    searchableTabTargets.add(paneTarget);
    gridApiByTabTarget[paneTarget] = admin.gridKey;
    const entry = { admin, loaded: false, paneTarget, view };
    entries.set(event.key, entry);
    if (gridsReady) gridApis[admin.gridKey] = admin.init();
    return entry;
  };

  const unmount = key => {
    const entry = entries.get(key);
    if (!entry) return;
    entry.admin.destroy();
    delete gridApis[entry.admin.gridKey];
    searchableTabTargets.delete(entry.paneTarget);
    delete gridApiByTabTarget[entry.paneTarget];
    entry.view.remove();
    entries.delete(key);
  };

  const renderArchive = () => {
    const archived = archivedEvents(events);
    const tab = archiveTab();
    // Solange das Archiv offen ist, bleibt sein Eintrag stehen - auch wenn es gerade leer wurde.
    tab.hidden = !archived.length && !tab.classList.contains("active");
    tab.querySelector(".sidebar__nav-label").textContent = archived.length ? `Archiv (${archived.length})` : "Archiv";
    const list = document.getElementById("eventArchiveList");
    if (!archived.length) {
      list.innerHTML = '<p class="event-archive__empty">Keine archivierten Events.</p>';
      return;
    }
    list.replaceChildren(...archived.map(event => {
      const row = document.createElement("article");
      row.className = "event-archive__item";
      row.dataset.eventKey = event.key;
      row.innerHTML = `${eventIconSvg(event.symbol, "event-archive__icon")}
        <div class="event-archive__text"><strong></strong><span></span></div>
        <div class="event-archive__actions">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-archive-action="open">Liste öffnen</button>
          <button class="btn btn-sm btn-outline-primary" type="button" data-archive-action="restore">Wieder aktivieren</button>
        </div>`;
      row.querySelector("strong").textContent = event.label;
      row.querySelector(".event-archive__text span").textContent = [describeEvent({ datum: event.datum }), `${event.participantCount} Teilnehmer`].filter(Boolean).join(" · ");
      row.querySelector('[data-archive-action="open"]').addEventListener("click", () => Tab.getOrCreateInstance(entries.get(event.key).view.tab).show());
      row.querySelector('[data-archive-action="restore"]').addEventListener("click", () => saveEvent({ ...event, archiviert: false }));
      return row;
    }));
  };

  // Neuer oder geaenderter Stand vom Server in Liste, Navigation und Teilnehmerliste uebernehmen
  const apply = event => {
    events = sortEvents([...events.filter(entry => entry.id !== event.id), event]);
    const entry = entries.get(event.key);
    if (entry) {
      entry.view.update(event);
      entry.admin.update(event);
    } else {
      mount(event);
    }
    orderTabs();
    renderArchive();
    return entries.get(event.key);
  };

  const saveEvent = async event => {
    const saved = await api.updateEvent(event);
    apply(saved);
    showToast(saved.archiviert ? `${saved.label} archiviert.` : `${saved.label} gespeichert.`);
    return saved;
  };

  // Startet beim Login und nach jeder erneuten Anmeldung: Stand vom Server abgleichen
  const load = async () => {
    try {
      events = sortEvents(await retryAsync(api.loadEvents));
    } catch (error) {
      if (error?.sessionExpired) throw error;
      console.warn("Events konnten nicht geladen werden.", error);
      showToast(error.message || "Events konnten nicht geladen werden.");
      return;
    }
    const keys = new Set(events.map(event => event.key));
    [...entries.keys()].filter(key => !keys.has(key)).forEach(unmount);
    events.forEach(event => {
      const entry = entries.get(event.key);
      if (!entry) mount(event);
      else {
        entry.view.update(event);
        entry.admin.update(event);
      }
    });
    orderTabs();
    renderArchive();
    await Promise.all([...entries.values()]
      .filter(entry => entry.loaded || !entry.admin.event.archiviert)
      .map(loadParticipants));
  };

  const fillSettings = event => {
    const form = settingsForm();
    const values = event || { label: "", datum: "", symbol: "kalender", maxSeats: "", mealOptions: [], preis: "", pdfHinweis: "", archiviert: false };
    form.elements.label.value = values.label;
    form.elements.datum.value = values.datum || "";
    form.elements.symbol.value = values.symbol;
    form.elements.maxSeats.value = values.maxSeats ?? "";
    form.elements.mealOptions.value = formatMealOptions(values.mealOptions);
    form.elements.preis.value = values.preis ?? "";
    form.elements.pdfHinweis.value = values.pdfHinweis || "";
    form.elements.archiviert.checked = Boolean(values.archiviert);
    document.getElementById("eventSettingsModalLabel").textContent = event ? `${event.label} bearbeiten` : "Neues Event";
    document.getElementById("eventSettingsArchive").hidden = !event;
    document.getElementById("eventSettingsDeleteBtn").hidden = !event;
  };

  function openSettings(event) {
    editing = event ? events.find(entry => entry.id === event.id) || event : null;
    fillSettings(editing);
    setSettingsError("");
    settingsModal.show();
  }

  const handleSettingsSubmit = async submitEvent => {
    submitEvent.preventDefault();
    const form = submitEvent.target;
    const payload = toEventPayload({
      label: form.elements.label.value,
      datum: form.elements.datum.value,
      symbol: form.elements.symbol.value,
      maxSeats: form.elements.maxSeats.value,
      mealOptions: form.elements.mealOptions.value,
      preis: form.elements.preis.value,
      pdfHinweis: form.elements.pdfHinweis.value,
      archiviert: form.elements.archiviert.checked
    });
    try {
      setSettingsError("");
      if (editing) {
        await saveEvent({ id: editing.id, ...payload });
        dirtyForms.markClean(form);
        settingsModal.hide();
        return;
      }
      const created = await api.createEvent(payload);
      const entry = apply(created);
      dirtyForms.markClean(form);
      settingsModal.hide();
      await loadParticipants(entry);
      Tab.getOrCreateInstance(entry.view.tab).show();
      showToast(`${created.label} angelegt.`);
    } catch (error) {
      setSettingsError(error.message || "Event konnte nicht gespeichert werden.");
    }
  };

  const handleDelete = async () => {
    const event = editing;
    if (!event) return;
    const confirmed = await confirmAction({
      title: "Event löschen",
      text: `„${event.label}“ endgültig löschen? Das geht nur, solange die Teilnehmerliste leer ist - sonst bitte archivieren.`,
      confirmLabel: "Löschen",
      danger: true
    });
    if (!confirmed) return;
    try {
      setSettingsError("");
      await api.deleteEvent(event.id);
      dirtyForms.markClean(settingsForm());
      settingsModal.hide();
      const entry = entries.get(event.key);
      if (entry?.view.tab.classList.contains("active")) Tab.getOrCreateInstance(document.getElementById("dashboard-tab")).show();
      unmount(event.key);
      events = events.filter(entry => entry.id !== event.id);
      renderArchive();
      showToast(`${event.label} gelöscht.`);
    } catch (error) {
      setSettingsError(error.message || "Event konnte nicht gelöscht werden.");
    }
  };

  const buildSymbolChoices = () => {
    const group = document.getElementById("eventSettingsSymbols");
    group.replaceChildren(...EVENT_SYMBOLS.map(({ value, label }) => {
      const option = document.createElement("label");
      option.className = "event-symbol";
      option.title = label;
      option.innerHTML = `<input type="radio" name="symbol" value="${value}">${eventIconSvg(value, "event-symbol__icon")}<span></span>`;
      option.querySelector("span").textContent = label;
      return option;
    }));
  };

  // Nach den uebrigen Tabellen: erst dann gibt es createGrid & Co.
  const initGrids = () => {
    gridsReady = true;
    entries.forEach(entry => { gridApis[entry.admin.gridKey] = entry.admin.init(); });
    if (settingsModal) return;
    buildSymbolChoices();
    settingsModal = new Modal(document.getElementById("eventSettingsModal"));
    dirtyForms.register(settingsForm());
    dirtyForms.guardModal(document.getElementById("eventSettingsModal"), () => settingsModal.hide());
    settingsForm().addEventListener("submit", handleSettingsSubmit);
    document.getElementById("eventSettingsDeleteBtn").addEventListener("click", handleDelete);
    document.getElementById("addEventBtn").addEventListener("click", () => openSettings(null));
    // Archivierte Listen laden erst, wenn jemand sie oeffnet
    document.getElementById("mainTabs").addEventListener("shown.bs.tab", tabEvent => {
      const entry = [...entries.values()].find(candidate => candidate.view.tab === tabEvent.target);
      if (entry && !entry.loaded) loadParticipants(entry);
      if (tabEvent.target !== archiveTab()) renderArchive();
    });
  };

  const admins = () => [...entries.values()].map(entry => entry.admin);

  return { admins, initGrids, load };
};
