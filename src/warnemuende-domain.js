export const mealOptions = ["Zander", "Rind", "Vegie"];
export const MAX_SEATS = 49;

/**
 * Nummeriert in Anmeldereihenfolge (id), nicht nach der gerade sichtbaren Sortierung:
 * an der Nummer haengt, wer mitfaehrt und wer nachrueckt.
 */
export const numberParticipants = participants => [...participants]
  .sort((a, b) => a.id - b.id)
  .map((participant, index) => ({ ...participant, nr: index + 1, nachruecker: index >= MAX_SEATS }));

export const summarizeMeals = participants =>
  mealOptions.map(option => `${option}: ${participants.filter(participant => participant.essensauswahl === option).length}`).join(" · ");

export const toParticipantPayload = participant => ({
  name: (participant.name || "").trim(),
  vorname: (participant.vorname || "").trim(),
  essensauswahl: participant.essensauswahl || mealOptions[0],
  bezahlt: Boolean(participant.bezahlt),
  bemerkung: (participant.bemerkung || "").trim(),
  mitgliedId: Number(participant.mitgliedId) > 0 ? Number(participant.mitgliedId) : null
});
