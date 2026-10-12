import { ISSUE_LEVELS, findMemberIssues, formatMemberName, isActiveMember, isGuestMember } from "./member-domain.js";

const LEVEL_LABELS = { fehler: "Fehler", warnung: "Warnungen", hinweis: "Hinweise" };
const LEVEL_BADGES = { fehler: "Fehler", warnung: "Warnung", hinweis: "Hinweis" };

// Ansicht "Auffaellige Daten": prueft bei jedem Neuaufbau alle Datensaetze, auch Ehemalige und Gaeste
export const createMemberIssuesView = ({ openMemberModal }) => {
  const shownLevels = new Set(ISSUE_LEVELS);
  let entries = [];

  const memberStatus = member => [!isActiveMember(member) && "Ehemalig", isGuestMember(member) && "Gast"].filter(Boolean);

  const renderFilters = () => {
    const toolbar = document.getElementById("memberIssuesFilters");
    toolbar.replaceChildren(...ISSUE_LEVELS.map(level => {
      const count = entries.reduce((sum, entry) => sum + entry.issues.filter(issue => issue.level === level).length, 0);
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
    document.getElementById("memberIssuesSummary").textContent = `${visible.length} von ${entries.length} auffälligen Datensätzen`;

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "recent-change-list__empty";
      empty.textContent = entries.length ? "Für die gewählten Stufen gibt es keine Auffälligkeiten." : "Keine Auffälligkeiten gefunden.";
      list.replaceChildren(empty);
      return;
    }

    list.replaceChildren(...visible.map(({ member, issues }) => {
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
      memberStatus(member).forEach(label => {
        const tag = document.createElement("span");
        tag.className = "member-issue__tag";
        tag.textContent = label;
        header.appendChild(tag);
      });

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
    }));
  };

  const render = members => {
    if (!document.getElementById("memberIssuesList")) return;
    entries = findMemberIssues(members);
    renderFilters();
    renderList();
  };

  return { render };
};
