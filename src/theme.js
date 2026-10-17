const THEME_STORAGE_KEY = "mitgliederverwaltung:theme";

export const initTheme = () => {
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let preference;
  try { preference = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
  if (preference !== "light" && preference !== "dark") preference = null;

  const apply = theme => {
    root.dataset.bsTheme = theme;
    const dark = theme === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.title = dark ? "Helle Darstellung einschalten" : "Dunkle Darstellung einschalten";
    window.dispatchEvent(new Event("themechange"));
  };

  toggle.addEventListener("click", () => {
    preference = root.dataset.bsTheme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch {}
    apply(preference);
  });
  systemTheme.addEventListener("change", event => {
    if (!preference) apply(event.matches ? "dark" : "light");
  });
  window.addEventListener("storage", event => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    preference = event.newValue === "light" || event.newValue === "dark" ? event.newValue : null;
    apply(preference || (systemTheme.matches ? "dark" : "light"));
  });
  apply(preference || (systemTheme.matches ? "dark" : "light"));
};
