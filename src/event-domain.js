const isMitfahrend = participant => !participant?.abgesagt;

/**
 * Zaehlt die Liste in der uebergebenen Reihenfolge von oben nach unten durch - also
 * so, wie sie gerade angezeigt wird. Abgesagte behalten ihren Platz in der Liste,
 * bekommen aber keine Nummer; dadurch rueckt der erste Nachruecker auf.
 */
export const numberParticipants = (participants, maxSeats = Infinity) => {
  let platz = 0;
  return participants.map(participant => {
    const nr = isMitfahrend(participant) ? ++platz : null;
    return { ...participant, nr, nachruecker: nr !== null && nr > maxSeats };
  });
};

export const sortByAnmeldung = participants => [...participants].sort((a, b) => a.id - b.id);

export const summarizeMeals = (participants, mealOptions = []) =>
  mealOptions.map(option => `${option}: ${participants.filter(participant => isMitfahrend(participant) && participant.essensauswahl === option).length}`).join(" · ");

/** Events ohne Essensauswahl schicken das Feld gar nicht erst mit - die API kennt es dort nicht. */
export const toParticipantPayload = (participant, mealOptions = []) => ({
  name: (participant.name || "").trim(),
  vorname: (participant.vorname || "").trim(),
  ...(mealOptions.length ? { essensauswahl: participant.essensauswahl || mealOptions[0] } : {}),
  bezahlt: Boolean(participant.bezahlt),
  abgesagt: Boolean(participant.abgesagt),
  bemerkung: (participant.bemerkung || "").trim(),
  mitgliedId: Number(participant.mitgliedId) > 0 ? Number(participant.mitgliedId) : null
});

/** Bindet die Event-Konfiguration an die Helfer, damit die Aufrufer sie nicht mitschleppen. */
export const createEventDomain = ({ mealOptions = [], maxSeats = Infinity }) => ({
  mealOptions,
  maxSeats,
  numberParticipants: participants => numberParticipants(participants, maxSeats),
  sortByAnmeldung,
  summarizeMeals: participants => summarizeMeals(participants, mealOptions),
  toParticipantPayload: participant => toParticipantPayload(participant, mealOptions)
});
