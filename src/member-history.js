import { fieldDefinitions } from "./member-config.js";
import { formatDateTimeDE, formatMemberName } from "./member-domain.js";
import { formatDateDE } from "./member-utils.js";
import { recentChangesCache, state } from "./state.js";

const actionLabel = action => ({
  created: "Mitglied angelegt",
  updated: "Mitglied geändert",
  deleted: "Mitglied gelöscht",
  photo_updated: "Passbild geändert",
  photo_deleted: "Passbild entfernt"
}[action] || "Änderung");
// preisClub und preisComputer liefert die API seit "Bereinige Filter und Preisfelder" nicht mehr -
// aeltere Protokollzeilen in der Datenbank tragen sie aber weiterhin. Der Filter bleibt deshalb.
const hiddenFields = new Set(["preisClub", "preisComputer", "gruppenwahl", "auswahl"]);
const hiddenLabels = new Set(["Preis Club", "Preis Computer", "Gruppenwahl", "Auswahl"]);
const visibleChanges = changes => Array.isArray(changes)
  ? changes.filter(change => !hiddenFields.has(change.field)
    && !hiddenLabels.has(change.label)
    && String(change.old ?? "").trim() !== String(change.new ?? "").trim())
  : [];
const visibleItems = items => Array.isArray(items) ? items.filter(item => visibleChanges(item.changes).length) : [];
const formatValue = (change, value) => {
  const text = String(value ?? "").trim();
  if (!text) return "leer";
  const field = fieldDefinitions.find(({ key, label }) => key === change.field || label === change.label);
  return field?.type === "date" ? formatDateDE(text) : text;
};

export const createMemberHistory = ({ loadMemberChanges, loadRecentChanges, openMemberModal }) => {
  const findMemberById = id => state.members.find(member => member.id === id);

  const renderMemberHistory = (items, { message = "" } = {}) => {
    const container = document.getElementById("memberChangeHistory");
    if (!container) return;
    const itemsToRender = visibleItems(items);
    if (message || !itemsToRender.length) {
      const empty = document.createElement("div");
      empty.className = "member-change-history__empty";
      empty.textContent = message || "Noch keine Änderungen protokolliert.";
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren();
    itemsToRender.forEach(item => {
      const entry = document.createElement("article");
      entry.className = "member-change-entry";
      const header = document.createElement("div");
      header.className = "member-change-entry__header";
      const title = document.createElement("strong");
      title.textContent = actionLabel(item.action);
      const meta = document.createElement("span");
      meta.textContent = `${formatDateTimeDE(item.changedAt)}${item.changedByName ? ` · ${item.changedByName}` : ""}`;
      header.append(title, meta);
      entry.appendChild(header);
      const changes = visibleChanges(item.changes);
      if (changes.length) {
        const list = document.createElement("ul");
        list.className = "member-change-entry__list";
        changes.forEach(change => {
          const listItem = document.createElement("li");
          listItem.textContent = `${change.label || change.field}: ${formatValue(change, change.old)} -> ${formatValue(change, change.new)}`;
          list.appendChild(listItem);
        });
        entry.appendChild(list);
      }
      container.appendChild(entry);
    });
  };

  const loadMemberChangeHistory = async (memberId, isNew) => {
    if (isNew) {
      renderMemberHistory([], { message: "Änderungen werden nach dem ersten Speichern protokolliert." });
      return;
    }
    renderMemberHistory([], { message: "Änderungsverlauf wird geladen..." });
    try {
      renderMemberHistory(await loadMemberChanges(memberId));
    } catch (error) {
      console.warn("Änderungsverlauf konnte nicht geladen werden.", error);
      renderMemberHistory([], { message: "Änderungsverlauf konnte nicht geladen werden." });
    }
  };

  const memberLabel = item => {
    const apiName = String(item.memberName || "").trim();
    if (apiName) return apiName;
    const member = findMemberById(Number(item.memberId));
    return member ? formatMemberName(member) : `Mitglied ${item.memberId}`;
  };

  const createRecentEntry = item => {
    const entry = document.createElement("article");
    entry.className = "recent-change-entry";
    const header = document.createElement("div");
    header.className = "recent-change-entry__header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "recent-change-entry__title";
    const action = document.createElement("strong");
    action.textContent = actionLabel(item.action);
    const memberButton = document.createElement("button");
    memberButton.className = "recent-change-entry__member";
    memberButton.type = "button";
    memberButton.textContent = memberLabel(item);
    memberButton.disabled = item.memberExists === false || !findMemberById(Number(item.memberId));
    memberButton.title = memberButton.disabled ? "Mitglied ist nicht mehr vorhanden" : "Mitglied öffnen";
    memberButton.addEventListener("click", () => openMemberModal(Number(item.memberId)));
    const meta = document.createElement("span");
    meta.textContent = `${formatDateTimeDE(item.changedAt)}${item.changedByName ? ` - ${item.changedByName}` : ""}`;
    titleWrap.append(action, memberButton);
    header.append(titleWrap, meta);
    entry.appendChild(header);
    const changes = visibleChanges(item.changes);
    if (changes.length) {
      const list = document.createElement("ul");
      list.className = "recent-change-entry__list";
      changes.forEach(change => {
        const listItem = document.createElement("li");
        listItem.textContent = `${change.label || change.field}: ${formatValue(change, change.old)} -> ${formatValue(change, change.new)}`;
        list.appendChild(listItem);
      });
      entry.appendChild(list);
    }
    return entry;
  };

  const renderRecentChanges = (items, { message = "" } = {}) => {
    const container = document.getElementById("recentChangesList");
    if (!container) return;
    const itemsToRender = visibleItems(items);
    if (message || !itemsToRender.length) {
      const empty = document.createElement("div");
      empty.className = "recent-change-list__empty";
      empty.textContent = message || "Noch keine Änderungen protokolliert.";
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...itemsToRender.map(createRecentEntry));
  };

  const refreshRecentChanges = ({ force = false } = {}) => {
    if (!force && recentChangesCache.loaded) {
      renderRecentChanges(state.recentChanges);
      return Promise.resolve();
    }
    if (recentChangesCache.promise) return recentChangesCache.promise;
    const button = document.getElementById("refreshRecentChangesBtn");
    recentChangesCache.promise = (async () => {
      if (button) button.disabled = true;
      renderRecentChanges(state.recentChanges, { message: state.recentChanges.length ? "" : "Änderungen werden geladen..." });
      try {
        const payload = await loadRecentChanges();
        state.recentChanges = Array.isArray(payload?.changes) ? payload.changes : [];
        recentChangesCache.loaded = true;
        renderRecentChanges(state.recentChanges);
      } catch (error) {
        console.warn("Letzte Aenderungen konnten nicht geladen werden.", error);
        renderRecentChanges(state.recentChanges, { message: state.recentChanges.length ? "" : "Letzte Änderungen konnten nicht geladen werden." });
      } finally {
        if (button) button.disabled = false;
        recentChangesCache.promise = null;
      }
    })();
    return recentChangesCache.promise;
  };

  return { loadMemberChangeHistory, refreshRecentChanges, renderMemberHistory, renderRecentChanges };
};
