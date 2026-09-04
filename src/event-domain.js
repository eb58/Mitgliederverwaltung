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

const normalizePersonName = value => String(value || "")
  .trim()
  .toLocaleLowerCase("de")
  .replace(/ä/g, "ae")
  .replace(/ö/g, "oe")
  .replace(/ü/g, "ue")
  .replace(/ß/g, "ss")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]/g, "");

const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1])
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const nameSimilarity = (left, right) => {
  const maxLength = Math.max(left.length, right.length);
  return maxLength ? 1 - editDistance(left, right) / maxLength : 0;
};

export const findEventMemberMatches = (members, participant, limit = 6) => {
  const name = normalizePersonName(participant?.name);
  const vorname = normalizePersonName(participant?.vorname);
  if (!name && !vorname) return { kind: "none", candidates: [] };

  const comparable = members
    .filter(member => Number(member?.id) > 0)
    .map(member => ({ member, name: normalizePersonName(member.name), vorname: normalizePersonName(member.vorname) }));
  const exact = vorname ? comparable.filter(candidate => candidate.name === name && candidate.vorname === vorname) : [];
  if (exact.length) return { kind: "exact", candidates: exact.map(candidate => candidate.member).slice(0, limit) };

  const candidates = comparable
    .map(candidate => {
      const nameScore = nameSimilarity(name, candidate.name);
      const vornameScore = vorname ? nameSimilarity(vorname, candidate.vorname) : null;
      const score = vornameScore === null ? nameScore : nameScore * 0.65 + vornameScore * 0.35;
      return { ...candidate, score, nameScore, vornameScore };
    })
    .filter(candidate => candidate.nameScore >= 0.5
      && (candidate.vornameScore === null || candidate.vornameScore >= 0.35)
      && candidate.score >= 0.58)
    .sort((left, right) => right.score - left.score || Number(left.member.id) - Number(right.member.id))
    .slice(0, limit)
    .map(candidate => candidate.member);
  return { kind: candidates.length ? "fuzzy" : "none", candidates };
};

/** Fragt im Singular, wenn nur eine Person zur Auswahl steht. */
export const describeMemberMatch = ({ kind, count, enteredName }) => {
  const einleitung = kind === "exact"
    ? `Mehrere Personen passen zu „${enteredName}“.`
    : `Kein exakter Treffer für „${enteredName}“.`;
  const frage = count === 1
    ? "Ist diese Person gemeint?"
    : kind === "exact" ? "Welche ist gemeint?" : "Ist eine dieser Personen gemeint?";
  return `${einleitung} ${frage}`;
};

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
  findMemberMatches: (members, participant) => findEventMemberMatches(members, participant),
  sortByAnmeldung,
  summarizeMeals: participants => summarizeMeals(participants, mealOptions),
  toParticipantPayload: participant => toParticipantPayload(participant, mealOptions)
});
