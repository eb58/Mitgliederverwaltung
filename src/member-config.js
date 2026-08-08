export const interestGroups = [];
export const interestGroupMap = {};
export const seniorenclubsMap = [];
export const austrittsgrundMap = {};
export const funktionsMap = {};

export const christmasChoiceMap = {
  0: "Nein",
  1: "Ja",
  2: "Ja + Gast"
};

export const MEMBER_CLUB_ID = 9;
export const interestGroupOptions = [];
export const austrittsgrundOptions = [];
export const funktionsOptions = [];
export const seniorenclubOptions = [];

export const fieldDefinitions = [
  { key: "id", label: "ID", type: "number", required: true },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "vorname", label: "Vorname", type: "text", required: true },
  { key: "geschlecht", label: "Geschlecht", type: "radio", options: [{ value: "m", label: "männlich" }, { value: "w", label: "weiblich" }] },
  { key: "passbild", label: "Passbild", type: "text" },
  { key: "strasse", label: "Straße", type: "text" },
  { key: "plz", label: "PLZ", type: "text" },
  { key: "ort", label: "Ort", type: "text" },
  { key: "telefon", label: "Telefon", type: "text" },
  { key: "handy", label: "Handy", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "geburtstag", label: "Geburtstag", type: "date" },
  { key: "eintrittsdatum", label: "Eintrittsdatum", type: "date" },
  { key: "austrittsdatum", label: "Austrittsdatum", type: "date" },
  { key: "austrittsgrund", label: "Austrittsgrund", type: "select", options: austrittsgrundOptions, allowEmpty: true },
  { key: "interessengruppen", label: "Interessengruppen", type: "multiselect", options: interestGroupOptions },
  { key: "funktion", label: "Funktion", type: "multiselect", options: funktionsOptions, valueType: "textList" },
  { key: "ausweisErteilt", label: "Ausweis erteilt", type: "checkbox" },
  { key: "clubzugehoerigkeit", label: "Clubzugehörigkeit", type: "select", options: seniorenclubOptions, allowEmpty: true, valueType: "number" },
  { key: "weihnachtsessen", label: "Weihnachtsessen", type: "select", options: [{ value: 0, label: "Nein" }, { value: 1, label: "Ja" }, { value: 2, label: "Ja + Gast" }] },
  { key: "wnEssenBezahlt", label: "bezahlt", type: "checkbox" },
  { key: "beitragClubBezahlt", label: "Beitrag bezahlt", type: "checkbox" },
  { key: "betragClubBar", label: "Betrag bar", type: "currency" },
  { key: "beitragComputerBezahlt", label: "Beitrag Computer bezahlt", type: "checkbox" },
  { key: "betragComputerBar", label: "Beitrag Computer bar", type: "currency" },
  { key: "gezahlterBetragClub", label: "gezahlter Betrag Club", type: "currency" },
  { key: "einzahlungClubAm", label: "Einzahlung Club am", type: "date" },
  { key: "gezahlterBetragComputer", label: "gezahlter Betrag Computer", type: "currency" },
  { key: "einzahlungComputerAm", label: "Einzahlung Computer am", type: "date" },
  { key: "gezahlterBetragWeihnachten", label: "gezahlter Betrag Weihnachten", type: "currency" },
  { key: "bemerkung", label: "Bemerkung", type: "textarea" },
  { key: "tischnummer", label: "Tischnummer", type: "number" }
];

export const paidAmountDefaults = {
  beitragClubBezahlt: { amountField: "gezahlterBetragClub", amount: 30, dateField: "einzahlungClubAm" },
  beitragComputerBezahlt: { amountField: "gezahlterBetragComputer", amount: 20, dateField: "einzahlungComputerAm" },
  wnEssenBezahlt: { amountField: "gezahlterBetragWeihnachten" }
};

export const formSections = [
  { id: "basis", label: "Basis", fieldKeys: ["name", "vorname", "geschlecht", "geburtstag"] },
  { id: "kontakt", label: "Kontakt", fieldKeys: ["strasse", "plz", "ort", "telefon", "handy", "email"] },
  {
    id: "verein",
    label: "Verein",
    fieldKeys: ["eintrittsdatum", "austrittsdatum", "austrittsgrund", "clubzugehoerigkeit", "interessengruppen", "funktion", "ausweisErteilt"]
  },
  {
    id: "zahlungen",
    label: "Zahlungen",
    groups: [
      { label: "Club", fieldKeys: ["beitragClubBezahlt", "gezahlterBetragClub", "einzahlungClubAm"] },
      { label: "Computer", fieldKeys: ["beitragComputerBezahlt", "gezahlterBetragComputer", "einzahlungComputerAm"] }
    ]
  },
  {
    id: "weihnachten",
    label: "Weihnachten",
    fieldKeys: ["weihnachtsessen", "wnEssenBezahlt", "gezahlterBetragWeihnachten", "tischnummer"]
  },
  { id: "notizen", label: "Notizen", fieldKeys: ["bemerkung"] }
];

export const germanCollator = new Intl.Collator("de", { sensitivity: "base", numeric: true });
const interestGroupPriority = new Map([["Excel", 0], ["Skat", 1]]);
export const replaceObjectContents = (target, entries) => {
  Object.keys(target).forEach(key => delete target[key]);
  Object.assign(target, Object.fromEntries(entries));
};
export const replaceArrayContents = (target, values) => target.splice(0, target.length, ...values);

export const refreshReferenceOptions = () => {
  replaceObjectContents(interestGroupMap, interestGroups.map(group => [group.id, group.label]));
  replaceArrayContents(
    interestGroupOptions,
    [...interestGroups]
      .sort((a, b) => {
        const aPriority = interestGroupPriority.get(a.label) ?? Number.MAX_SAFE_INTEGER;
        const bPriority = interestGroupPriority.get(b.label) ?? Number.MAX_SAFE_INTEGER;
        return aPriority !== bPriority ? aPriority - bPriority : germanCollator.compare(a.label, b.label);
      })
      .map(group => ({ value: group.id, label: group.label }))
  );
  replaceArrayContents(
    austrittsgrundOptions,
    Object.entries(austrittsgrundMap)
      .filter(([, label]) => label)
      .map(([value, label]) => ({ value: Number(value), label }))
  );
  replaceArrayContents(funktionsOptions, Object.entries(funktionsMap).map(([value, label]) => ({ value: Number(value), label })));
  replaceArrayContents(seniorenclubOptions, seniorenclubsMap.map(club => ({ value: club.id, label: club.name })));
};

export const computerGroupPatterns = ["computer", "excel", "grundlagen", "pc", "publisher", "video", "winsoft"];

refreshReferenceOptions();
