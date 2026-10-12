import { Modal } from "bootstrap";
import { formatMemberName, isActiveMember, isGuestMember, mergeFieldDiffs, suggestMergeTarget } from "./member-domain.js";
import { formatDateDE } from "./member-utils.js";
import { showToast } from "./ui.js";

// Kurzbeschreibung eines Datensatzes, damit man die Doppelten auseinanderhalten kann
export const describeMergeCandidate = member => [
  `ID ${member.id}`,
  member.eintrittsdatum && `Eintritt ${formatDateDE(member.eintrittsdatum)}`,
  member.austrittsdatum && `Austritt ${formatDateDE(member.austrittsdatum)}`,
  member.ort,
  isGuestMember(member) ? "Gast" : !isActiveMember(member) && "ehemalig"
].filter(Boolean).join(" · ");

export const createMemberMergeDialog = ({ mergeMembers, onMerged }) => {
  let modal = null;
  let group = [];
  let targetId = null;
  let sourceId = null;
  let busy = false;
  let bound = false;

  const radioGroup = (name, members, selectedId, onChange) => {
    const wrapper = document.createElement("div");
    wrapper.className = "member-merge__options";
    members.forEach(member => {
      const label = document.createElement("label");
      label.className = "member-merge__option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(member.id);
      input.checked = member.id === selectedId;
      input.addEventListener("change", () => onChange(member.id));
      label.append(input, document.createTextNode(` ${formatMemberName(member)} (${describeMergeCandidate(member)})`));
      wrapper.appendChild(label);
    });
    return wrapper;
  };

  const render = () => {
    const target = group.find(member => member.id === targetId);
    const source = group.find(member => member.id === sourceId);
    const choice = document.getElementById("memberMergeChoice");
    const keepTitle = document.createElement("h3");
    keepTitle.className = "member-merge__choice-title";
    keepTitle.textContent = "Behalten wird";
    const parts = [keepTitle, radioGroup("memberMergeTarget", group, targetId, id => {
      targetId = id;
      if (sourceId === id) sourceId = group.find(member => member.id !== id).id;
      render();
    })];
    // Bei mehr als zwei Doppelten muss man zusaetzlich waehlen, welcher aufgeloest wird
    if (group.length > 2) {
      const dropTitle = document.createElement("h3");
      dropTitle.className = "member-merge__choice-title";
      dropTitle.textContent = "Aufgelöst wird";
      parts.push(dropTitle, radioGroup("memberMergeSource", group.filter(member => member.id !== targetId), sourceId, id => {
        sourceId = id;
        render();
      }));
    }
    choice.replaceChildren(...parts);

    document.getElementById("memberMergeTargetHead").textContent = `Behalten (ID ${target.id})`;
    document.getElementById("memberMergeSourceHead").textContent = `Auflösen (ID ${source.id})`;
    const diffs = mergeFieldDiffs(target, source);
    const rows = document.getElementById("memberMergeRows");
    if (!diffs.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "text-muted";
      cell.textContent = "Die beiden Datensätze unterscheiden sich in keinem Feld.";
      row.appendChild(cell);
      rows.replaceChildren(row);
      return;
    }
    rows.replaceChildren(...diffs.map(diff => {
      const row = document.createElement("tr");
      row.dataset.field = diff.key;
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = diff.label;
      const cell = (side, text, checked) => {
        const td = document.createElement("td");
        const label = document.createElement("label");
        label.className = "member-merge__value";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `memberMerge-${diff.key}`;
        input.value = side;
        input.checked = checked;
        label.append(input, document.createTextNode(` ${text}`));
        td.appendChild(label);
        return td;
      };
      row.append(name, cell("target", diff.targetText, !diff.fromSource), cell("source", diff.sourceText, diff.fromSource));
      return row;
    }));
  };

  const confirm = async () => {
    if (busy) return;
    const fromSource = [...document.querySelectorAll('#memberMergeRows input[value="source"]:checked')]
      .map(input => input.closest("tr").dataset.field);
    const button = document.getElementById("memberMergeConfirmBtn");
    busy = true;
    button.disabled = true;
    try {
      const merged = await mergeMembers(targetId, sourceId, fromSource);
      modal.hide();
      onMerged(merged, sourceId);
      showToast(`${formatMemberName(merged)} zusammengeführt.`, { duration: 4000 });
    } catch (error) {
      showToast(`Zusammenführen fehlgeschlagen: ${error.message}`);
    } finally {
      busy = false;
      button.disabled = false;
    }
  };

  const open = members => {
    modal ??= Modal.getOrCreateInstance(document.getElementById("memberMergeModal"));
    if (!bound) document.getElementById("memberMergeConfirmBtn").addEventListener("click", confirm);
    bound = true;
    group = members;
    targetId = suggestMergeTarget(members).id;
    sourceId = members.find(member => member.id !== targetId).id;
    render();
    modal.show();
  };

  return { open };
};
