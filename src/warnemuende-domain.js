export const mealOptions = ["Zander", "Rind", "Vegie"];
export const MAX_SEATS = 49;

const isMitfahrend = participant => !participant.abgesagt;

/**
 * Nummeriert in Anmeldereihenfolge (id), nicht nach der gerade sichtbaren Sortierung:
 * an der Nummer haengt, wer mitfaehrt und wer nachrueckt. Abgesagte behalten ihren
 * Platz in der Liste, zaehlen aber nicht mit - dadurch rueckt ein Nachruecker auf.
 */
export const numberParticipants = participants => {
  let platz = 0;
  return [...participants].sort((a, b) => a.id - b.id).map((participant, index) => {
    const nr = isMitfahrend(participant) ? ++platz : null;
    return { ...participant, position: index + 1, nr, nachruecker: nr !== null && nr > MAX_SEATS };
  });
};

export const summarizeMeals = participants =>
  mealOptions.map(option => `${option}: ${participants.filter(participant => isMitfahrend(participant) && participant.essensauswahl === option).length}`).join(" · ");

export const toParticipantPayload = participant => ({
  name: (participant.name || "").trim(),
  vorname: (participant.vorname || "").trim(),
  essensauswahl: participant.essensauswahl || mealOptions[0],
  bezahlt: Boolean(participant.bezahlt),
  abgesagt: Boolean(participant.abgesagt),
  bemerkung: (participant.bemerkung || "").trim(),
  mitgliedId: Number(participant.mitgliedId) > 0 ? Number(participant.mitgliedId) : null
});
