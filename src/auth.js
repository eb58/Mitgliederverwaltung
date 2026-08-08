import { Modal } from "bootstrap";
import { getNextId } from "./member-utils.js";
import { AUTH_TOKEN_STORAGE_KEY, state } from "./state.js";

const PASSWORD_VISIBILITY_MS = 1000;

export const createAuth = ({
  changeOwnPassword,
  clearMemberPhotoCache,
  loadMembers,
  refreshAllViews,
  request,
  setAppShellVisible,
  updateUserVisibility
}) => {
  const passwordVisibilityTimers = new Map();
  let loginModal = null;
  let loginWaitResolve = null;
  let passwordChangeRequiredFlow = true;
  let sessionExpiredNoticeShown = false;

  const clearPasswordVisibilityTimer = inputId => {
    const timer = passwordVisibilityTimers.get(inputId);
    if (!timer) return;
    clearTimeout(timer);
    passwordVisibilityTimers.delete(inputId);
  };

  const setPasswordVisibility = (inputId, visible) => {
    const passwordInput = document.getElementById(inputId);
    const button = document.querySelector(`[data-password-target="${inputId}"]`);
    if (!passwordInput || !button) return;
    passwordInput.type = visible ? "text" : "password";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", visible ? "Passwort verbergen" : "Passwort anzeigen");
    if (!visible) clearPasswordVisibilityTimer(inputId);
  };

  const hidePasswordFields = (...inputIds) => inputIds.forEach(inputId => setPasswordVisibility(inputId, false));
  const togglePasswordVisibility = event => {
    const inputId = event.currentTarget.dataset.passwordTarget;
    const passwordInput = inputId && document.getElementById(inputId);
    if (!passwordInput) return;
    const nextIsVisible = passwordInput.type === "password";
    setPasswordVisibility(inputId, nextIsVisible);
    if (!nextIsVisible) return;
    clearPasswordVisibilityTimer(inputId);
    passwordVisibilityTimers.set(inputId, setTimeout(() => setPasswordVisibility(inputId, false), PASSWORD_VISIBILITY_MS));
  };

  const clearPasswordChangeForm = () => {
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmNewPassword").value = "";
    document.getElementById("passwordChangeError").hidden = true;
    hidePasswordFields("newPassword", "confirmNewPassword");
  };

  const showLoginForm = () => {
    document.getElementById("loginForm").hidden = false;
    document.getElementById("passwordChangeForm").hidden = true;
    document.getElementById("loginError").hidden = true;
    hidePasswordFields("loginPassword");
    clearPasswordChangeForm();
  };

  const showPasswordChangeForm = ({ required = true } = {}) => {
    passwordChangeRequiredFlow = required;
    document.getElementById("loginForm").hidden = true;
    document.getElementById("passwordChangeForm").hidden = false;
    document.getElementById("passwordChangeCancelBtn").hidden = false;
    clearPasswordChangeForm();
    setTimeout(() => document.getElementById("newPassword")?.focus(), 150);
  };

  const setAuthToken = (token, { persist = true } = {}) => {
    state.authToken = token || "";
    if (state.authToken) sessionExpiredNoticeShown = false;
    if (state.authToken && persist) localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, state.authToken);
    else localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  };

  const clearAuthToken = () => {
    setAuthToken("");
    clearMemberPhotoCache();
  };

  const reloadMembers = async () => {
    state.members = await loadMembers();
    state.nextId = getNextId(state.members);
    setAppShellVisible(true);
    refreshAllViews();
  };

  const finishLogin = async () => {
    loginModal.hide();
    showLoginForm();
    if (loginWaitResolve) {
      loginWaitResolve(true);
      loginWaitResolve = null;
    } else {
      await reloadMembers();
    }
    setAppShellVisible(true);
  };

  const login = async (username, password) => {
    const payload = await request("/api/session", { method: "POST", body: { username, password }, requiresAuth: false });
    state.currentUser = payload.user || null;
    updateUserVisibility();
    setAuthToken(payload.token, { persist: !state.currentUser?.passwordChangeRequired });
  };

  const handleLoginSubmit = async event => {
    event.preventDefault();
    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const errorElement = document.getElementById("loginError");
    try {
      errorElement.hidden = true;
      await login(usernameInput.value.trim(), passwordInput.value);
      passwordInput.value = "";
      if (state.currentUser?.passwordChangeRequired) {
        setAppShellVisible(false);
        showPasswordChangeForm();
        return;
      }
      await finishLogin();
    } catch (error) {
      errorElement.textContent = error.message || "Anmeldung fehlgeschlagen.";
      errorElement.hidden = false;
    }
  };

  const abortRequiredPasswordChange = async () => {
    const token = state.authToken;
    clearAuthToken();
    state.currentUser = null;
    state.members = [];
    state.nextId = 1;
    refreshAllViews();
    setAppShellVisible(false);
    showLoginForm();
    loginModal.show();
    if (token) {
      try {
        await request("/api/session", { method: "DELETE", authToken: token });
      } catch (error) {
        console.warn("Server-Logout nach abgebrochenem Passwortwechsel fehlgeschlagen.", error);
      }
    }
  };

  const handlePasswordChangeCancel = async () => {
    if (passwordChangeRequiredFlow) return abortRequiredPasswordChange();
    loginModal.hide();
    showLoginForm();
    setAppShellVisible(true);
  };

  const handlePasswordChangeSubmit = async event => {
    event.preventDefault();
    const passwordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmNewPassword");
    const errorElement = document.getElementById("passwordChangeError");
    const password = passwordInput.value;
    const username = state.currentUser?.username || "";
    try {
      errorElement.hidden = true;
      if (!password) throw new Error("Bitte ein neues Passwort eingeben.");
      if (password !== confirmPasswordInput.value) throw new Error("Die Passwoerter stimmen nicht ueberein.");
      if (username && username.toLocaleLowerCase("de") === password.toLocaleLowerCase("de")) {
        throw new Error("Das neue Passwort darf nicht dem Benutzernamen entsprechen.");
      }
      const payload = await changeOwnPassword(password);
      state.currentUser = payload?.user || { ...state.currentUser, passwordChangeRequired: false };
      if (state.authToken) setAuthToken(state.authToken);
      updateUserVisibility();
      passwordInput.value = "";
      confirmPasswordInput.value = "";
      await (passwordChangeRequiredFlow ? finishLogin() : handlePasswordChangeCancel());
    } catch (error) {
      errorElement.textContent = error.message || "Passwort konnte nicht geaendert werden.";
      errorElement.hidden = false;
    }
  };

  const init = () => {
    loginModal = loginModal || new Modal(document.getElementById("loginModal"), { backdrop: "static", keyboard: false });
    const loginForm = document.getElementById("loginForm");
    if (loginForm.dataset.wired === "true") return;
    loginForm.dataset.wired = "true";
    loginForm.addEventListener("submit", handleLoginSubmit);
    document.getElementById("passwordChangeForm").addEventListener("submit", handlePasswordChangeSubmit);
    document.getElementById("passwordChangeCancelBtn").addEventListener("click", handlePasswordChangeCancel);
    document.querySelectorAll("[data-password-target]").forEach(button => button.addEventListener("click", togglePasswordVisibility));
  };

  const ensureAuthenticated = async () => {
    if (!state.authToken) {
      setAppShellVisible(false);
      showLoginForm();
      loginModal.show();
      return new Promise(resolve => { loginWaitResolve = resolve; });
    }
    try {
      const payload = await request("/api/session");
      state.currentUser = payload.user || null;
      updateUserVisibility();
      if (state.currentUser?.passwordChangeRequired) {
        setAuthToken(state.authToken, { persist: false });
        setAppShellVisible(false);
        showPasswordChangeForm();
        loginModal.show();
        return new Promise(resolve => { loginWaitResolve = resolve; });
      }
      return true;
    } catch {
      clearAuthToken();
      state.currentUser = null;
      setAppShellVisible(false);
      showLoginForm();
      loginModal.show();
      return new Promise(resolve => { loginWaitResolve = resolve; });
    }
  };

  const logout = () => {
    const token = state.authToken;
    clearAuthToken();
    state.currentUser = null;
    state.members = [];
    state.nextId = 1;
    refreshAllViews();
    setAppShellVisible(false);
    showLoginForm();
    loginModal.show();
    if (token) request("/api/session", { method: "DELETE", authToken: token }).catch(error => console.warn("Server-Logout fehlgeschlagen.", error));
  };

  const handleSessionExpired = () => {
    if (sessionExpiredNoticeShown) return;
    sessionExpiredNoticeShown = true;
    clearAuthToken();
    state.currentUser = null;
    state.members = [];
    state.nextId = 1;
    refreshAllViews();
    setAppShellVisible(false);
    showLoginForm();
    const errorElement = document.getElementById("loginError");
    errorElement.textContent = "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.";
    errorElement.hidden = false;
    loginModal.show();
  };

  const openPasswordChange = () => {
    if (!state.currentUser) return;
    showPasswordChangeForm({ required: false });
    loginModal.show();
  };

  return { ensureAuthenticated, handleSessionExpired, init, logout, openPasswordChange };
};
