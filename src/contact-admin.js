import { Modal } from "bootstrap";
import { formatIsoDate, normalizeGroupText, retryAsync } from "./member-utils.js";
import { showToast } from "./ui.js";
import {
  UNCATEGORIZED_LABEL,
  contactAddressLine,
  contactCategoryColor,
  contactCategoryOptions,
  contactDisplayName,
  contactInitials,
  contactPersonName,
  filterContacts,
  findContactCategory,
  groupContactsByCategory,
  mapHref,
  phoneHref,
  summarizeContactCategories,
  toContactPayload,
  toVCardFile,
  vCardFileName,
  websiteHref,
  websiteLabel
} from "./contact-domain.js";

const ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path>',
  mobile: '<rect x="6" y="2" width="12" height="20" rx="2"></rect><line x1="11" y1="18" x2="13" y2="18"></line>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path>',
  web: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"></path>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>',
  edit: '<path d="M4 20h4.8L19.1 9.7l-4.8-4.8L4 15.2V20z"></path><path d="M15.7 3.5l4.8 4.8"></path>',
  vcard: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><circle cx="8.5" cy="11" r="2.2"></circle><path d="M5 16.5a3.5 3.5 0 0 1 7 0"></path><line x1="14.5" y1="10" x2="19" y2="10"></line><line x1="14.5" y1="14" x2="19" y2="14"></line>',
  star: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"></path>',
  addressBook: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path><circle cx="12" cy="10" r="2.6"></circle><path d="M8 16.5a4 4 0 0 1 8 0"></path><line x1="2" y1="7" x2="5" y2="7"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="2" y1="17" x2="5" y2="17"></line>'
};

const icon = (name, className = "contact-icon") => `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24" focusable="false">${ICONS[name]}</svg>`;

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const downloadVCard = (fileName, contacts) => {
  const url = URL.createObjectURL(new Blob([toVCardFile(contacts)], { type: "text/vcard;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Ansicht "Adressen": Karten je Kategorie, Suche, Favoriten und ein Bearbeiten-Dialog
export const createContactAdmin = ({
  confirmAction, createCategory, createContact, deleteCategory, deleteContact, dirtyForms, isAdmin, loadCategories, loadContacts, showEmails, updateContact
}) => {
  let contacts = [];
  // Von Admins angelegte Kategorien ({ id, name }) - auch solche, die noch kein Kontakt benutzt.
  let categories = [];
  let search = "";
  let category = null;
  let favoritesOnly = false;
  let editModal = null;
  let editingId = null;
  // Eingabefelder fuer neue Kategorien: eins in der Filterleiste, eins im Bearbeiten-Dialog
  let filterCategoryAdder = null;
  let editCategoryAdder = null;

  const setMessage = (id, message) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.textContent = message || "";
    target.hidden = !message;
  };
  const setError = message => setMessage("contactsError", message);
  const setEditError = message => setMessage("contactEditError", message);

  const replaceContact = updated => {
    contacts = contacts.some(contact => contact.id === updated.id)
      ? contacts.map(contact => contact.id === updated.id ? updated : contact)
      : [...contacts, updated];
  };

  const visibleContacts = () => filterContacts(contacts, { search, category, favoritesOnly });
  const categoryNames = () => categories.map(entry => entry.name);
  const storedCategory = label => categories.find(entry => normalizeGroupText(entry.name) === normalizeGroupText(label));

  const createFilterChip = ({ label, count, pressed, color = null, onClick, extraClass = "" }) => {
    const chip = element("button", `contacts__chip ${extraClass}`.trim());
    chip.type = "button";
    if (color !== null) {
      chip.classList.add(`contact-cat--${color}`);
      chip.append(element("span", "contacts__chip-dot"));
    }
    chip.append(document.createTextNode(label), element("span", "contacts__chip-count", String(count)));
    chip.setAttribute("aria-pressed", String(pressed));
    chip.addEventListener("click", onClick);
    return chip;
  };

  const renderFilters = () => {
    const host = document.getElementById("contactsCategoryFilters");
    if (!host) return;
    const summary = summarizeContactCategories(contacts, categoryNames());
    // Eine Kategorie, die es nach dem Loeschen nicht mehr gibt, darf die Liste nicht leer halten.
    if (category !== null && !summary.some(entry => normalizeGroupText(entry.label) === normalizeGroupText(category))) category = null;
    const favoriteCount = contacts.filter(contact => contact.favorit).length;
    host.replaceChildren(
      createFilterChip({ label: "Alle", count: contacts.length, pressed: category === null, onClick: () => { category = null; render(); } }),
      ...summary.map(entry => createFilterChip({
        label: entry.label,
        count: entry.count,
        color: contactCategoryColor(entry.label),
        pressed: category !== null && normalizeGroupText(category) === normalizeGroupText(entry.label),
        onClick: () => { category = entry.label; render(); }
      })),
      createFilterChip({
        label: "Favoriten",
        count: favoriteCount,
        pressed: favoritesOnly,
        extraClass: "contacts__chip--favorite",
        onClick: () => { favoritesOnly = !favoritesOnly; render(); }
      })
    );
    host.querySelector(".contacts__chip--favorite")?.insertAdjacentHTML("afterbegin", icon("star", "contacts__chip-star"));
    if (isAdmin() && filterCategoryAdder) host.append(filterCategoryAdder.node());
  };

  const detailRow = (iconName, label, href, { external = false, title = "" } = {}) => {
    const item = element("li", "contact-card__detail");
    item.insertAdjacentHTML("afterbegin", icon(iconName));
    const target = href ? element("a", "contact-card__link", label) : element("span", "", label);
    if (href) {
      target.href = href;
      if (external) {
        target.target = "_blank";
        target.rel = "noopener noreferrer";
      }
    }
    if (title) target.title = title;
    item.append(target);
    return item;
  };

  const actionButton = (title, iconName, onClick, extraClass = "") => {
    const button = element("button", `edit-icon-btn ${extraClass}`.trim());
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = icon(iconName, "edit-icon-btn__icon");
    button.addEventListener("click", onClick);
    return button;
  };

  const renderCard = contact => {
    const name = contactDisplayName(contact);
    const card = element("article", `contact-card contact-cat--${contactCategoryColor(contact.kategorie)}`);
    card.dataset.contactId = String(contact.id);
    card.classList.toggle("contact-card--favorite", Boolean(contact.favorit));

    const header = element("header", "contact-card__header");
    const avatar = element("span", "contact-card__avatar", contactInitials(contact));
    avatar.setAttribute("aria-hidden", "true");
    const titleBlock = element("div", "contact-card__heading");
    const title = element("button", "contact-card__name", name);
    title.type = "button";
    title.title = "Kontakt bearbeiten";
    title.addEventListener("click", () => openEdit(contact));
    titleBlock.append(title);
    const person = contact.firma ? contactPersonName(contact) : "";
    const subtitle = [person, contact.zustaendigkeit].filter(Boolean).join(" · ");
    if (subtitle) titleBlock.append(element("p", "contact-card__subtitle", subtitle));
    const favorite = actionButton(
      contact.favorit ? "Aus den Favoriten nehmen" : "Als Favorit markieren",
      "star",
      () => toggleFavorite(contact),
      "contact-card__favorite"
    );
    favorite.setAttribute("aria-pressed", String(Boolean(contact.favorit)));
    header.append(avatar, titleBlock, favorite);

    const details = element("ul", "contact-card__details");
    if (contact.telefon) details.append(detailRow("phone", contact.telefon, phoneHref(contact.telefon), { title: "Anrufen" }));
    if (contact.handy) details.append(detailRow("mobile", contact.handy, phoneHref(contact.handy), { title: "Handy anrufen" }));
    if (contact.email) details.append(detailRow("mail", contact.email, `mailto:${contact.email}`, { title: "E-Mail schreiben" }));
    if (contact.webseite) details.append(detailRow("web", websiteLabel(contact.webseite), websiteHref(contact.webseite), { external: true, title: "Webseite öffnen" }));
    const address = contactAddressLine(contact);
    if (address) details.append(detailRow("pin", address, mapHref(contact), { external: true, title: "Auf der Karte zeigen" }));
    if (!details.children.length) details.append(element("li", "contact-card__empty", "Noch keine Kontaktdaten hinterlegt"));

    card.append(header, details);
    if (contact.bemerkung) card.append(element("p", "contact-card__note", contact.bemerkung));

    const footer = element("footer", "contact-card__footer");
    const tag = element("span", "contact-card__tag", contact.kategorie || UNCATEGORIZED_LABEL);
    const actions = element("span", "contact-card__actions");
    actions.append(
      actionButton("Als Kontakt speichern (vCard)", "vcard", () => downloadVCard(vCardFileName(contact), [contact])),
      actionButton("Kontakt bearbeiten", "edit", () => openEdit(contact))
    );
    footer.append(tag, actions);
    card.append(footer);
    return card;
  };

  const renderGroup = group => {
    const section = element("section", `contacts__group contact-cat--${group.color}`);
    section.dataset.category = group.label;
    const heading = element("header", "contacts__group-header");
    const title = element("h3", "contacts__group-title");
    title.append(element("span", "contacts__chip-dot"), document.createTextNode(group.label));
    heading.append(title, element("span", "contacts__group-count", String(group.contacts.length)));
    if (group.contacts.some(contact => contact.email)) {
      const mail = actionButton(`E-Mail-Adressen: ${group.label}`, "mail", () => showEmails(group.label, group.contacts), "contacts__group-mail");
      heading.append(mail);
    }
    const cards = element("div", "contacts__cards");
    cards.append(...group.contacts.map(renderCard));
    section.append(heading, cards);
    return section;
  };

  const renderEmpty = () => {
    const empty = element("div", "contacts__empty");
    empty.insertAdjacentHTML("afterbegin", icon("addressBook", "contacts__empty-icon"));
    // Eine angelegte Kategorie ohne Kontakte: hier fuellt man sie - oder ein Admin loescht sie wieder.
    if (category !== null && !filterContacts(contacts, { category }).length) {
      empty.append(
        element("p", "contacts__empty-title", `Noch keine Kontakte in „${category}“`),
        element("p", "contacts__empty-text", "Ein neuer Kontakt landet von hier aus gleich in dieser Kategorie.")
      );
      const actions = element("div", "contacts__empty-actions");
      const add = element("button", "btn btn-primary", "Kontakt anlegen");
      add.type = "button";
      add.addEventListener("click", () => openEdit(null));
      actions.append(add);
      const stored = storedCategory(category);
      if (stored && isAdmin()) {
        const remove = element("button", "btn btn-outline-danger contacts__delete-category", "Kategorie löschen");
        remove.type = "button";
        remove.addEventListener("click", () => removeCategory(stored));
        actions.append(remove);
      }
      empty.append(actions);
    } else if (!contacts.length) {
      empty.append(
        element("p", "contacts__empty-title", "Noch keine Adressen"),
        element("p", "contacts__empty-text", "Hier stehen Musiker, Bezirksamt, Reinigungsfirma, Vermieter und alle anderen Ansprechpartner außerhalb des Clubs.")
      );
      const add = element("button", "btn btn-primary", "Ersten Kontakt anlegen");
      add.type = "button";
      add.addEventListener("click", () => openEdit(null));
      empty.append(add);
    } else {
      empty.append(element("p", "contacts__empty-title", "Keine Treffer"), element("p", "contacts__empty-text", "Für Suche und Filter gibt es keinen passenden Kontakt."));
    }
    return empty;
  };

  const render = () => {
    const list = document.getElementById("contactsList");
    if (!list) return;
    renderFilters();
    const visible = visibleContacts();
    const summary = document.getElementById("contactsSummary");
    if (summary) {
      summary.textContent = visible.length === contacts.length
        ? `${contacts.length} ${contacts.length === 1 ? "Kontakt" : "Kontakte"}`
        : `${visible.length} von ${contacts.length} Kontakten`;
    }
    const exportButton = document.getElementById("contactsExportBtn");
    if (exportButton) exportButton.disabled = !visible.length;
    list.replaceChildren(...(visible.length ? groupContactsByCategory(visible).map(renderGroup) : [renderEmpty()]));
  };

  // Faengt seine Ladefehler selbst ab: eine fehlende Tabelle soll den Start nicht verhindern.
  const load = async () => {
    try {
      [contacts, categories] = await Promise.all([retryAsync(loadContacts), retryAsync(loadCategories)]);
      setError("");
    } catch (error) {
      contacts = [];
      categories = [];
      setError(error.message || "Adressen konnten nicht geladen werden.");
      if (error?.sessionExpired) throw error;
    } finally {
      render();
    }
  };

  const toggleFavorite = async contact => {
    try {
      setError("");
      const updated = await updateContact(contact.id, toContactPayload({ ...contact, favorit: !contact.favorit }));
      replaceContact(updated);
      render();
      showToast(`${contactDisplayName(updated)} ${updated.favorit ? "ist jetzt Favorit" : "ist kein Favorit mehr"}.`, { duration: 3000 });
    } catch (error) {
      setError(error.message || "Favorit konnte nicht gespeichert werden.");
    }
  };

  // Legt die Kategorie an. Gibt es sie schon, kommt nur ihre vorhandene Schreibweise zurueck.
  const addCategory = async (value, showError) => {
    const name = String(value ?? "").trim();
    if (!name) {
      showError("Bitte einen Namen für die Kategorie eintragen.");
      return null;
    }
    const existing = findContactCategory(contactCategoryOptions(contacts, categoryNames()), name);
    if (existing) return existing;
    try {
      showError("");
      const created = await createCategory(name);
      categories = [...categories, created];
      showToast(`Kategorie „${created.name}“ angelegt.`);
      return created.name;
    } catch (error) {
      showError(error.message || "Kategorie konnte nicht angelegt werden.");
      return null;
    }
  };

  // Statt Browser-Dialog: der Chip "+ Kategorie" klappt zu einem Eingabefeld mit Anlegen/Abbrechen auf.
  // Kein <form>, weil es auch im Formular des Bearbeiten-Dialogs steht; das Feld hat keinen name,
  // damit handleSubmit es nicht als Kontaktfeld mitschickt.
  const createCategoryAdder = ({ chipClass, chipLabel, showError, onCreated }) => {
    let open = false;
    const chip = element("button", chipClass, chipLabel);
    chip.type = "button";
    chip.title = "Neue Kategorie anlegen";
    const box = element("div", "category-adder");
    const input = element("input", "form-control form-control-sm category-adder__input");
    Object.assign(input, { type: "text", maxLength: 80, placeholder: "Name der Kategorie", autocomplete: "off" });
    input.setAttribute("aria-label", "Name der neuen Kategorie");
    const save = element("button", "btn btn-sm btn-primary", "Anlegen");
    save.type = "button";
    const cancel = element("button", "btn btn-sm btn-outline-secondary", "Abbrechen");
    cancel.type = "button";
    box.append(input, save, cancel);

    const close = () => {
      open = false;
      input.value = "";
      box.replaceWith(chip);
    };
    const submit = async () => {
      save.disabled = true;
      const name = await addCategory(input.value, showError);
      save.disabled = false;
      if (!name) {
        input.focus();
        return;
      }
      close();
      onCreated(name);
    };
    chip.addEventListener("click", () => {
      open = true;
      chip.replaceWith(box);
      input.focus();
    });
    save.addEventListener("click", submit);
    cancel.addEventListener("click", () => {
      showError("");
      close();
    });
    input.addEventListener("keydown", event => {
      // Enter wuerde sonst den Kontakt speichern, Esc den ganzen Dialog schliessen.
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        showError("");
        close();
      }
    });
    return {
      node: () => open ? box : chip,
      reset: () => {
        if (open) close();
      }
    };
  };

  const removeCategory = async entry => {
    const confirmed = await confirmAction({
      title: "Kategorie löschen",
      text: `Die Kategorie „${entry.name}“ hat keine Kontakte mehr. Soll sie gelöscht werden?`,
      confirmLabel: "Löschen",
      danger: true
    });
    if (!confirmed) return;
    try {
      setError("");
      await deleteCategory(entry.id);
      categories = categories.filter(item => item.id !== entry.id);
      category = null;
      render();
      showToast(`Kategorie „${entry.name}“ gelöscht.`);
    } catch (error) {
      setError(error.message || "Kategorie konnte nicht gelöscht werden.");
    }
  };

  const form = () => document.getElementById("contactEditForm");

  const renderCategoryChips = () => {
    const host = document.getElementById("contactEditCategoryChips");
    const input = form()?.elements.kategorie;
    if (!host || !input) return;
    const selected = normalizeGroupText(input.value);
    // Die gewaehlte Kategorie steht mit drin, auch wenn sie nur noch dieser Kontakt benutzt.
    const chips = contactCategoryOptions([...contacts, { kategorie: input.value }], categoryNames()).map(option => {
      const chip = element("button", `meal-chip contact-category-chip contact-cat--${contactCategoryColor(option)}`, option);
      chip.type = "button";
      const isSelected = normalizeGroupText(option) === selected;
      chip.classList.toggle("is-selected", isSelected);
      chip.setAttribute("aria-pressed", String(isSelected));
      // Nochmal klicken nimmt die Kategorie wieder weg - der Kontakt steht dann unter "Ohne Kategorie".
      chip.addEventListener("click", () => selectCategory(isSelected ? "" : option));
      return chip;
    });
    if (isAdmin() && editCategoryAdder) chips.push(editCategoryAdder.node());
    host.replaceChildren(...chips);
  };

  const selectCategory = value => {
    form().elements.kategorie.value = value;
    renderCategoryChips();
  };

  // Statt Browser-Dialog: Rueckfrage als Leiste im Fuss des Dialogs (wie beim Verwerfen in der Mitgliedsmaske).
  const toggleDeleteConfirm = show => {
    document.getElementById("contactDeleteConfirm").hidden = !show;
    document.getElementById("contactDeleteBtn").hidden = show || editingId === null;
    document.querySelector("#contactEditModal .contact-form-cancel").hidden = show;
    if (show) document.getElementById("contactDeleteCancelBtn").focus();
  };

  const openEdit = contact => {
    const target = form();
    if (!target || !editModal) return;
    editingId = contact?.id ?? null;
    target.reset();
    // Ein neuer Kontakt uebernimmt die gerade gefilterte Kategorie - das spart beim Erfassen einer ganzen Gruppe Klicks.
    const values = contact || { kategorie: category && category !== UNCATEGORIZED_LABEL ? category : "" };
    [...target.elements].forEach(field => {
      if (!field.name) return;
      if (field.type === "checkbox") field.checked = Boolean(values[field.name]);
      else field.value = values[field.name] ?? "";
    });
    document.getElementById("contactEditModalLabel").textContent = contact ? `${contactDisplayName(contact)} bearbeiten` : "Neuer Kontakt";
    toggleDeleteConfirm(false);
    setEditError("");
    editCategoryAdder?.reset();
    renderCategoryChips();
    editModal.show();
  };

  const handleSubmit = async submitEvent => {
    submitEvent.preventDefault();
    const target = submitEvent.target;
    const payload = toContactPayload(Object.fromEntries([...target.elements]
      .filter(field => field.name)
      .map(field => [field.name, field.type === "checkbox" ? field.checked : field.value])));
    if (!payload.name && !payload.firma) {
      setEditError("Bitte einen Namen oder eine Firma eintragen.");
      target.elements.firma.focus();
      return;
    }
    try {
      setEditError("");
      const saved = editingId === null ? await createContact(payload) : await updateContact(editingId, payload);
      replaceContact(saved);
      render();
      dirtyForms.markClean(target);
      editModal.hide();
      showToast(`${contactDisplayName(saved)} gespeichert.`);
    } catch (error) {
      setEditError(error.message || "Kontakt konnte nicht gespeichert werden.");
    }
  };

  const askDelete = () => {
    const contact = contacts.find(entry => entry.id === editingId);
    if (!contact) return;
    document.getElementById("contactDeleteConfirmText").textContent = `${contactDisplayName(contact)} endgültig löschen?`;
    toggleDeleteConfirm(true);
  };

  const handleDelete = async () => {
    const contact = contacts.find(entry => entry.id === editingId);
    toggleDeleteConfirm(false);
    if (!contact) return;
    try {
      setEditError("");
      await deleteContact(contact.id);
      contacts = contacts.filter(entry => entry.id !== contact.id);
      render();
      dirtyForms.markClean(form());
      editModal.hide();
      showToast(`${contactDisplayName(contact)} gelöscht.`);
    } catch (error) {
      setEditError(error.message || "Kontakt konnte nicht gelöscht werden.");
    }
  };

  const exportVisible = () => {
    const visible = visibleContacts();
    if (visible.length) downloadVCard(`adressen-${formatIsoDate(new Date())}.vcf`, visible);
  };

  const init = () => {
    if (!editModal) {
      editModal = new Modal(document.getElementById("contactEditModal"));
      dirtyForms.register(form());
      dirtyForms.guardModal(document.getElementById("contactEditModal"), () => editModal.hide());
    }
    document.getElementById("addContactBtn")?.addEventListener("click", () => openEdit(null));
    document.getElementById("contactsExportBtn")?.addEventListener("click", exportVisible);
    document.getElementById("contactsSearch")?.addEventListener("input", event => {
      search = event.target.value;
      render();
    });
    form()?.addEventListener("submit", handleSubmit);
    document.getElementById("contactDeleteBtn")?.addEventListener("click", askDelete);
    document.getElementById("contactDeleteConfirmBtn")?.addEventListener("click", handleDelete);
    document.getElementById("contactDeleteCancelBtn")?.addEventListener("click", () => toggleDeleteConfirm(false));
    filterCategoryAdder ||= createCategoryAdder({
      chipClass: "contacts__chip contacts__chip--new",
      chipLabel: "+ Kategorie",
      showError: setError,
      // Die neue Kategorie gleich auswaehlen - dann steht darunter "Kontakt anlegen".
      onCreated: name => {
        category = name;
        render();
      }
    });
    editCategoryAdder ||= createCategoryAdder({
      chipClass: "meal-chip contact-category-chip contact-category-chip--new",
      chipLabel: "+ Neue Kategorie",
      showError: setEditError,
      onCreated: name => {
        render();
        selectCategory(name);
      }
    });
    render();
  };

  return { init, load };
};
