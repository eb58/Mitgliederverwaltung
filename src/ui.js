export const showToast = (message, { duration = 6000 } = {}) => {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.setAttribute("role", "alert");
  toast.innerHTML = '<span class="toast-item__message"></span><button type="button" class="toast-item__close" aria-label="Schließen">×</button>';
  toast.querySelector(".toast-item__message").textContent = message;
  const dismiss = () => {
    toast.classList.add("toast-item--leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };
  toast.querySelector(".toast-item__close").addEventListener("click", dismiss);
  setTimeout(dismiss, duration);
  stack.appendChild(toast);
};

export const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};
