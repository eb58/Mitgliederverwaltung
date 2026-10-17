import { describeEvent, eventDomId } from "./event-domain.js";

// Bilder zu EVENT_SYMBOLS (event-domain.js); im Stil der uebrigen Navigationssymbole
const ICON_PATHS = {
  kalender: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>',
  essen: '<path d="M7 3v8"/><path d="M11 3v8"/><path d="M9 11v10"/><path d="M17 3c-1.5 2-2 4-2 6v3h4V9c0-2-.5-4-2-6z"/><path d="M17 12v9"/>',
  schiff: '<path d="M2 20c1.8 0 1.8-1.5 3.7-1.5S7.4 20 9.2 20s1.8-1.5 3.7-1.5S14.6 20 16.4 20s1.8-1.5 3.6-1.5"/><path d="M12 16V7"/><path d="M12 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/><path d="M6 12h12"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="12" y1="3" x2="12" y2="10"/><circle cx="8" cy="19.5" r="1.5"/><circle cx="16" cy="19.5" r="1.5"/>',
  feier: '<polygon points="12 2 15 9 22 9.3 16.6 13.8 18.5 21 12 17 5.5 21 7.4 13.8 2 9.3 9 9"/>',
  musik: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
};

export const eventIconSvg = (symbol, className = "sidebar__nav-icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[symbol] || ICON_PATHS.kalender}</svg>`;

const fromHtml = html => {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
};

const DOWNLOAD_ICON = '<svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>';
const SETTINGS_ICON = '<svg class="edit-icon-btn__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>';

/**
 * Baut Navigationseintrag, Seite mit Teilnehmerliste und Bearbeiten-Dialog eines Events.
 * Die Ids folgen eventDomId(); event-admin.js findet seine Bausteine darueber.
 */
export const createEventView = event => {
  const { key } = event;
  const id = part => eventDomId(key, part);

  const tab = fromHtml(`
    <button class="nav-link sidebar__nav-item" id="${id("tab")}" data-bs-toggle="tab" data-bs-target="#${id("pane")}" type="button" role="tab" aria-controls="${id("pane")}" aria-selected="false">
      <span class="event-tab__icon"></span><span class="sidebar__nav-label"></span>
    </button>`);

  const pane = fromHtml(`
    <div class="tab-pane fade" id="${id("pane")}" role="tabpanel" aria-labelledby="${id("tab")}" tabindex="0">
      <form id="${id("form")}" class="grid-toolbar event-toolbar">
        <div class="event-heading">
          <span id="${id("summary")}" class="event-summary" aria-live="polite"></span>
          <span id="${id("description")}" class="event-description"></span>
        </div>
        <input class="form-control event-toolbar__input" name="name" type="text" placeholder="Name" aria-label="Name" required>
        <input class="form-control event-toolbar__input" name="vorname" type="text" placeholder="Vorname (optional)" aria-label="Vorname">
        <input type="hidden" name="essensauswahl" value="">
        <div id="${id("essensauswahl")}"></div>
        <input class="form-control event-toolbar__input" name="bemerkung" type="text" placeholder="Bemerkung" aria-label="Bemerkung">
        <button class="btn btn-primary" type="submit">Hinzuf&uuml;gen</button>
        <button id="${id("hide-cancelled-btn")}" class="event-cancelled-toggle" type="button"
          aria-label="Abgesagte ausblenden" title="Abgesagte ausblenden" aria-pressed="false"></button>
        <button id="${id("export-btn")}" class="edit-icon-btn" type="button"
          title="Teilnehmerliste als PDF herunterladen" aria-label="Teilnehmerliste als PDF herunterladen">${DOWNLOAD_ICON}</button>
        <button id="${id("settings-btn")}" class="edit-icon-btn" type="button"
          title="Event bearbeiten" aria-label="Event bearbeiten">${SETTINGS_ICON}</button>
      </form>
      <div id="${id("error")}" class="alert alert-danger" role="alert" hidden></div>
      <div id="${id("grid")}" class="grid-host grid-host--with-toolbar"></div>
    </div>`);

  const modal = fromHtml(`
    <div class="modal fade" id="${id("edit-modal")}" tabindex="-1" aria-labelledby="${id("edit-modal-label")}" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h5" id="${id("edit-modal-label")}">Teilnehmer bearbeiten</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schlie&szlig;en"></button>
          </div>
          <div class="modal-body">
            <form id="${id("edit-form")}" class="event-edit-form">
              <div>
                <label class="form-label" for="${id("edit-name")}">Name</label>
                <input id="${id("edit-name")}" class="form-control" name="name" type="text" required>
              </div>
              <div>
                <label class="form-label" for="${id("edit-vorname")}">Vorname</label>
                <input id="${id("edit-vorname")}" class="form-control" name="vorname" type="text">
              </div>
              <div class="event-edit-form__wide" data-meal-field>
                <span class="form-label d-block">Essensauswahl</span>
                <input type="hidden" name="essensauswahl" value="">
                <div id="${id("edit-essensauswahl")}"></div>
              </div>
              <div class="event-edit-form__wide event-edit-form__flags">
                <div class="form-check">
                  <input id="${id("edit-bezahlt")}" class="form-check-input" name="bezahlt" type="checkbox">
                  <label class="form-check-label" for="${id("edit-bezahlt")}">bezahlt</label>
                </div>
                <div class="form-check">
                  <input id="${id("edit-abgesagt")}" class="form-check-input" name="abgesagt" type="checkbox">
                  <label class="form-check-label" for="${id("edit-abgesagt")}">abgesagt</label>
                </div>
              </div>
              <div class="event-edit-form__wide">
                <label class="form-label" for="${id("edit-bemerkung")}">Bemerkung</label>
                <input id="${id("edit-bemerkung")}" class="form-control" name="bemerkung" type="text">
              </div>
              <div class="event-edit-form__actions">
                <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Abbrechen</button>
                <button class="btn btn-primary" type="submit">Speichern</button>
              </div>
            </form>
            <div id="${id("edit-error")}" class="login-error mt-3" role="alert" hidden></div>
          </div>
        </div>
      </div>
    </div>`);

  // Alles, was sich beim Bearbeiten des Events aendern kann
  const update = next => {
    tab.querySelector(".event-tab__icon").innerHTML = eventIconSvg(next.symbol);
    tab.querySelector(".sidebar__nav-label").textContent = next.label;
    tab.hidden = Boolean(next.archiviert);
    const description = pane.querySelector(`#${id("description")}`);
    description.textContent = describeEvent(next);
    description.hidden = !description.textContent;
  };
  update(event);

  const remove = () => [tab, pane, modal].forEach(element => element.remove());

  return { tab, pane, modal, update, remove };
};
