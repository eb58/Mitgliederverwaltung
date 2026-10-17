import { Modal, Tab } from "bootstrap";
import { state } from "./state.js";

export const createUserAdmin = ({ createUser, deactivateUser, dirtyForms, loadUsers, updateUser }) => {
  let modal = null;
  const form = () => document.getElementById("userForm");
  // Bearbeiten/Neu ersetzen den Inhalt der Maske - offene Eingaben erst nach Rueckfrage
  const afterConfirm = proceed => () => dirtyForms.confirmLeave(form(), proceed);

  const resetForm = () => {
    document.getElementById("userId").value = "";
    document.getElementById("userUsername").value = "";
    document.getElementById("userUsername").disabled = false;
    document.getElementById("userPassword").value = "";
    document.getElementById("userPassword").required = true;
    document.getElementById("userRole").value = "admin";
    document.getElementById("userActive").checked = true;
    document.getElementById("userAdminError").hidden = true;
    dirtyForms.markClean(form());
  };

  const fillForm = user => {
    document.getElementById("userId").value = user.id;
    document.getElementById("userUsername").value = user.username;
    document.getElementById("userUsername").disabled = true;
    document.getElementById("userPassword").value = "";
    document.getElementById("userPassword").required = false;
    document.getElementById("userRole").value = user.role || "admin";
    document.getElementById("userActive").checked = Boolean(user.active);
    document.getElementById("userAdminError").hidden = true;
    dirtyForms.markClean(form());
  };

  const refresh = async () => {
    const payload = await loadUsers();
    const users = Array.isArray(payload.users) ? payload.users : [];
    const rows = users.map(user => {
      const row = document.createElement("tr");
      const cells = [user.username, user.role, user.active ? "aktiv" : "inaktiv"].map(text => {
        const cell = document.createElement("td");
        cell.textContent = text;
        return cell;
      });
      const actions = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.className = "btn btn-sm btn-outline-secondary me-2";
      editButton.type = "button";
      editButton.textContent = "Bearbeiten";
      editButton.addEventListener("click", afterConfirm(() => fillForm(user)));
      const deactivateButton = document.createElement("button");
      deactivateButton.className = "btn btn-sm btn-outline-danger";
      deactivateButton.type = "button";
      deactivateButton.textContent = "Deaktivieren";
      deactivateButton.disabled = !user.active || user.id === state.currentUser?.id;
      deactivateButton.addEventListener("click", async () => {
        const errorElement = document.getElementById("userAdminError");
        try {
          errorElement.hidden = true;
          await deactivateUser(user.id);
          await refresh();
        } catch (error) {
          errorElement.textContent = error.message || "Benutzer konnte nicht deaktiviert werden.";
          errorElement.hidden = false;
        }
      });
      actions.append(editButton, deactivateButton);
      row.append(...cells, actions);
      return row;
    });
    document.getElementById("userTableBody").replaceChildren(...rows);
  };

  const open = async () => {
    resetForm();
    await refresh();
    modal.show();
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const errorElement = document.getElementById("userAdminError");
    const id = Number(document.getElementById("userId").value);
    const user = {
      id,
      username: document.getElementById("userUsername").value.trim(),
      password: document.getElementById("userPassword").value,
      role: document.getElementById("userRole").value,
      active: document.getElementById("userActive").checked
    };
    try {
      errorElement.hidden = true;
      await (id ? updateUser(user) : createUser(user));
      resetForm();
      await refresh();
    } catch (error) {
      errorElement.textContent = error.message || "Benutzer konnte nicht gespeichert werden.";
      errorElement.hidden = false;
    }
  };

  const init = () => {
    modal = modal || new Modal(document.getElementById("userAdminModal"));
    const userForm = form();
    if (userForm.dataset.wired !== "true") {
      userForm.dataset.wired = "true";
      userForm.addEventListener("submit", handleSubmit);
      dirtyForms.register(userForm);
      dirtyForms.guardModal(document.getElementById("userAdminModal"), () => modal.hide());
      document.getElementById("manageUsersBtn").addEventListener("click", open);
      document.getElementById("resetUserFormBtn").addEventListener("click", afterConfirm(resetForm));
    }
  };

  const updateVisibility = () => {
    const isAdmin = String(state.currentUser?.role || "").trim().toLowerCase() === "admin";
    const username = String(state.currentUser?.username || "").trim();
    const changePasswordButton = document.getElementById("changePasswordBtn");
    if (changePasswordButton) changePasswordButton.hidden = !state.currentUser;
    ["manageUsersBtn", "manageReferenceDataBtn", "member-issues-tab"].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.hidden = !isAdmin;
    });
    // "Auffaellige Daten" ist Admins vorbehalten: stand ein anderer Benutzer zuletzt dort, geht es zum Dashboard.
    const issuesTab = document.getElementById("member-issues-tab");
    const dashboardTab = document.getElementById("dashboard-tab");
    if (!isAdmin && issuesTab?.classList.contains("active") && dashboardTab) Tab.getOrCreateInstance(dashboardTab).show();
    const logoutButton = document.getElementById("logoutBtn");
    if (logoutButton) {
      logoutButton.hidden = !username;
      logoutButton.title = username ? `Abmelden (${username})` : "Abmelden";
      logoutButton.setAttribute("aria-label", logoutButton.title);
    }
    const currentUserName = document.getElementById("currentUserName");
    if (currentUserName) currentUserName.textContent = username;
    const passwordChangeUser = document.getElementById("passwordChangeUser");
    if (passwordChangeUser) {
      passwordChangeUser.hidden = !username;
      passwordChangeUser.textContent = username ? `Benutzer: ${username}` : "";
    }
  };

  return { init, updateVisibility };
};
