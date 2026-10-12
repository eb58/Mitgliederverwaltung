import { ISSUE_LEVELS, findDuplicateGroups, findMemberIssues, formatMemberName, isActiveMember, isGuestMember } from "./member-domain.js";
import { describeMergeCandidate } from "./member-merge.js";

const LEVEL_LABELS = { fehler: "Fehler", warnung: "Warnungen", hinweis: "Hinweise" };
const LEVEL_BADGES = { fehler: "Fehler", warnung: "Warnung", hinweis: "Hinweis" };
// Ausgetretene Gaeste stehen bei den Ehemaligen, wie in der Ehemaligen-Liste
const GROUPS = [
  { key: "mitglieder", label: "Mitglieder", matches: member => isActiveMember(member) && !isGuestMember(member) },
  { key: "gaeste", label: "Gäste", matches: member => isActiveMember(member) && isGuestMember(member) },
  { key: "ehemalige", label: "Ehemalige", matches: member => !isActiveMember(member) }
];

// Ansicht "Auffaellige Daten": prueft bei jedem Neuaufbau alle Datensaetze, auch Ehemalige und Gaeste
export const createMemberIssuesView = ({ openMemberModal, openMerge }) => {
  const shownLevels = new Set(ISSUE_LEVELS);
  let entries = [];
  let duplicates = [];


  const renderFilters = () => {
    const toolbar = document.getElementById("memberIssuesFilters");
    toolbar.replaceChildren(...ISSUE_LEVELS.map(level => {
      const count = entries.reduce((sum, entry) => sum + entry.issues.filter(issue => issue.level === level).length, 0)
        + (level === "warnung" ? duplicates.length : 0);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-outline-secondary guest-toggle payment-toggle";
      button.dataset.level = level;
      button.textContent = `${LEVEL_LABELS[level]} (${count})`;
      button.classList.toggle("active", shownLevels.has(level));
      button.setAttribute("aria-pressed", String(shownLevels.has(level)));
      button.addEventListener("click", () => {
        if (shownLevels.has(level)) shownLevels.delete(level);
        else shownLevels.add(level);
        renderFilters();
        renderList();
      });
      return button;
    }));
  };

  const renderList = () => {
    const list = document.getElementById("memberIssuesList");
    const visible = entries
      .map(entry => ({ ...entry, issues: entry.issues.filter(issue => shownLevels.has(issue.level)) }))
      .filter(entry => entry.issues.length);
    const shownDuplicates = shownLevels.has("warnung") ? duplicates : [];
    document.getElementById("memberIssuesSummary").textContent = `${visible.length} von ${entries.length} auffälligen Datensätzen`
      + (duplicates.length ? ` · ${duplicates.length} mögliche Doppelte` : "");

    if (!visible.length && !shownDuplicates.length) {
      const empty = document.createElement("div");
      empty.className = "recent-change-list__empty";
      empty.textContent = entries.length || duplicates.length ? "Für die gewählten Stufen gibt es keine Auffälligkeiten." : "Keine Auffälligkeiten gefunden.";
      list.replaceChildren(empty);
      return;
    }

    list.replaceChildren(...[
      shownDuplicates.length && renderSection("doppelte", "Mögliche Doppelte", shownDuplicates.map(renderDuplicateCard)),
      ...GROUPS.map(group => {
        const groupEntries = visible.filter(entry => group.matches(entry.member));
        return groupEntries.length && renderSection(group.key, group.label, groupEntries.map(renderCard));
      })
    ].filter(Boolean));
  };

  const renderSection = (key, label, cardElements) => {
    const section = document.createElement("section");
    section.className = "member-issues__group";
    section.dataset.group = key;
    const heading = document.createElement("h2");
    heading.className = "member-issues__group-title";
    heading.textContent = `${label} (${cardElements.length})`;
    const cards = document.createElement("div");
    cards.className = "member-issues__cards";
    cards.append(...cardElements);
    section.append(heading, cards);
    return section;
  };

  const renderDuplicateCard = members => {
    const card = document.createElement("article");
    card.className = "member-issue member-issue--duplicate";
    card.dataset.memberIds = members.map(member => member.id).join(",");
    const header = document.createElement("header");
    header.className = "member-issue__header";
    const title = document.createElement("span");
    title.className = "member-issue__title";
    title.textContent = `${formatMemberName(members[0])} (${members.length}×)`;
    const mergeButton = document.createElement("button");
    mergeButton.type = "button";
    mergeButton.className = "btn btn-sm btn-outline-primary member-issue__merge";
    mergeButton.textContent = "Zusammenführen…";
    mergeButton.addEventListener("click", () => openMerge(members));
    header.append(title, mergeButton);

    const list = document.createElement("ul");
    list.className = "member-issue__list";
    members.forEach(member => {
      const item = document.createElement("li");
      const name = document.createElement("button");
      name.type = "button";
      name.className = "member-issue__name member-issue__name--small";
      name.title = "Mitglied bearbeiten";
      name.textContent = describeMergeCandidate(member);
      name.addEventListener("click", () => openMemberModal(member.id));
      item.appendChild(name);
      list.appendChild(item);
    });
    card.append(header, list);
    return card;
  };

  const renderCard = ({ member, issues }) => {
    const card = document.createElement("article");
    card.className = "member-issue";
    card.dataset.memberId = String(member.id);

    const header = document.createElement("header");
    header.className = "member-issue__header";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "member-issue__name";
    name.title = "Mitglied bearbeiten";
    name.textContent = formatMemberName(member);
    name.addEventListener("click", () => openMemberModal(member.id));
    header.appendChild(name);
    if (!isActiveMember(member) && isGuestMember(member)) {
      const tag = document.createElement("span");
      tag.className = "member-issue__tag";
      tag.textContent = "Gast";
      header.appendChild(tag);
    }

    const issueList = document.createElement("ul");
    issueList.className = "member-issue__list";
    issues.forEach(issue => {
      const item = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = `member-issue__badge member-issue__badge--${issue.level}`;
      badge.textContent = LEVEL_BADGES[issue.level];
      item.append(badge, document.createTextNode(issue.message));
      issueList.appendChild(item);
    });

    card.append(header, issueList);
    return card;
  };

  const render = members => {
    if (!document.getElementById("memberIssuesList")) return;
    entries = findMemberIssues(members);
    duplicates = findDuplicateGroups(members);
    renderFilters();
    renderList();
  };

  return { render };
};
