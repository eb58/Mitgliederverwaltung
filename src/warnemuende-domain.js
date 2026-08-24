export const mealOptions = ["Zander", "Rind", "Vegie"];
export const MAX_SEATS = 49;

const isMitfahrend = participant => !participant?.abgesagt;

/**
 * Zaehlt die Liste in der uebergebenen Reihenfolge von oben nach unten durch - also
 * so, wie sie gerade angezeigt wird. Abgesagte behalten ihren Platz in der Liste,
 * bekommen aber keine Nummer; dadurch rueckt der erste Nachruecker auf.
 */
export const numberParticipants = participants => {
  let platz = 0;
  return participants.map(participant => {
    const nr = isMitfahrend(participant) ? ++platz : null;
    return { ...participant, nr, nachruecker: nr !== null && nr > MAX_SEATS };
  });
};

export const sortByAnmeldung = participants => [...participants].sort((a, b) => a.id - b.id);

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
