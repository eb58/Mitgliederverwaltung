import { Modal } from "bootstrap";
import { formatMemberName, isActiveMember, isGuestMember } from "./member-domain.js";
import { formatDateDE } from "./member-utils.js";

const memberStatus = member => isGuestMember(member) ? "Gast" : isActiveMember(member) ? "Mitglied" : "Ehemalig";

const memberDetails = member => [
  memberStatus(member),
  `Nr. ${member.id}`,
  member.geburtstag ? `geb. ${formatDateDE(member.geburtstag)}` : "",
  member.ort || ""
].filter(Boolean).join(" · ");

export const createEventMemberMatchDialog = () => {
  const element = document.getElementById("eventMemberMatchModal");
  const message = document.getElementById("eventMemberMatchMessage");
  const candidateList = document.getElementById("eventMemberMatchCandidates");
  const keepNameButton = document.getElementById("eventMemberMatchKeepNameBtn");
  const modal = Modal.getOrCreateInstance(element);
  const state = { resolve: null };

  const resolveCurrent = result => {
    if (!state.resolve) return;
    const resolve = state.resolve;
    state.resolve = null;
    resolve(result);
  };
  const finish = result => {
    modal.hide();
    resolveCurrent(result);
  };

  keepNameButton.addEventListener("click", () => finish({ confirmed: true, member: null }));
  element.addEventListener("hidden.bs.modal", () => resolveCurrent({ confirmed: false, member: null }));

  const choose = ({ participant, candidates, kind }) => new Promise(resolve => {
    resolveCurrent({ confirmed: false, member: null });
    state.resolve = resolve;
    const enteredName = `${participant.vorname} ${participant.name}`.trim();
    message.textContent = kind === "exact"
      ? `Mehrere Personen passen zu „${enteredName}“. Welche ist gemeint?`
      : `Kein exakter Treffer für „${enteredName}“. Ist eine dieser Personen gemeint?`;
    candidateList.replaceChildren(...candidates.map(member => {
      const button = document.createElement("button");
      const name = document.createElement("strong");
      const details = document.createElement("span");
      button.type = "button";
      button.className = "list-group-item list-group-item-action event-member-match-option";
      name.textContent = formatMemberName(member);
      details.textContent = memberDetails(member);
      button.append(name, details);
      button.addEventListener("click", () => finish({ confirmed: true, member }));
      return button;
    }));
    modal.show();
  });

  return { choose };
};
