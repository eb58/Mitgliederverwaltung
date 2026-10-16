// Rueckfrage im Stil der App statt window.confirm: ein natives <dialog> mit showModal(). Es liegt im
// Top Layer, sperrt den Rest der Seite und schliesst mit Esc - ganz ohne Bootstrap-JS. Die Knoepfe
// stehen in einem <form method="dialog"> und schliessen mit ihrem value als returnValue.
export const createConfirmDialog = () => {
  const dialog = document.getElementById("confirmModal");
  const heading = document.getElementById("confirmModalLabel");
  const message = document.getElementById("confirmModalMessage");
  const cancelButton = document.getElementById("confirmModalCancelBtn");
  const confirmButton = document.getElementById("confirmModalConfirmBtn");
  let resolveCurrent = null;

  dialog.addEventListener("close", () => {
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.(dialog.returnValue === "confirm");
  });
  // Klick neben den Dialog bricht ab (closedby="any" koennen noch nicht alle Browser).
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  const ask = ({ title, text, confirmLabel = "OK", danger = false }) => new Promise(resolve => {
    if (dialog.open) {
      resolve(false);
      return;
    }
    resolveCurrent = resolve;
    heading.textContent = title;
    message.textContent = text;
    confirmButton.textContent = confirmLabel;
    confirmButton.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
    // Bei Loeschen & Co. startet der Fokus auf "Abbrechen" - Enter loescht dann nicht aus Versehen.
    cancelButton.autofocus = danger;
    confirmButton.autofocus = !danger;
    dialog.returnValue = "";
    dialog.showModal();
  });

  return { ask };
};
