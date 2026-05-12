// dummyData.js - Generierung von Dummy-Daten für die Mitgliederdatenbank

const interestGroupMap = {
  1: "Allgemein",
  2: "Gymnastik 1",
  3: "Kreativ",
  4: "Computer",
  5: "Kartenspiel",
  6: "Englisch",
  7: "Zeitlosen",
  8: "Tischtennis 1",
  9: "Schach",
  10: "Smartphone Apple",
  11: "Laufgruppe",
  15: "Tischtennis 2",
  16: "Excel",
  17: "WinSoft",
  18: "Smartphone Android",
  19: "Video",
  20: "Publisher",
  21: "PCimAlltag",
  22: "Grundlagen",
  23: "Senioren-Skat",
  24: "Gesprächskreis Aktuelles",
  26: "Tischtennis 3"
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pick = arr => arr[randomInt(0, arr.length - 1)];

const randomDateBetween = (start, end) => {
  const time = randomInt(start.getTime(), end.getTime());
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const sanitizeForEmail = value => String(value)
  .normalize("NFD")
  .replace(/[^\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]/g, "")
  .toLowerCase();

const randomGroupIds = () => {
  const ids = Object.keys(interestGroupMap).map(Number);
  const selected = [];
  while (selected.length < randomInt(0, 3)) {
    const candidate = pick(ids);
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected.sort((a, b) => a - b);
};

const maybeDateFromYear = year => {
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);
  return randomDateBetween(start, end);
};

const parseLegacyDate = value => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/[./]/).map(part => part.trim()).filter(Boolean);
  if (parts.length !== 3) return "";
  let [day, month, year] = parts.map(Number);
  if (year < 100) year += 1900;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return "";
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const roundCurrency = value => Math.round(Number(value) * 100) / 100;

const parseLegacyCurrency = value => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return roundCurrency(value);
  const normalized = String(value).replace(/\s/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
};

const asBoolean = value => {
  if (value === true || value === 1 || value === -1) return true;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return ["true", "1", "-1", "yes"].includes(lower);
  }
  return false;
};

const ensureMinimumAge = (isoDate, minAge = 55, today = new Date()) => {
  const normalized = parseLegacyDate(isoDate);
  if (!normalized) return isoDate;
  const parts = normalized.split("-");
  if (parts.length !== 3) return normalized;
  const [year, month, day] = parts.map(Number);
  if (![year, month, day].every(Number.isFinite)) return normalized;
  const birthDate = new Date(year, month - 1, day);
  const minBirthday = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
  return birthDate <= minBirthday ? normalized : `${minBirthday.getFullYear()}-${String(minBirthday.getMonth() + 1).padStart(2, "0")}-${String(minBirthday.getDate()).padStart(2, "0")}`;
};

const normalizeMember = raw => {
  const clone = { ...raw };

  clone.id = Number(clone.id);
  clone.name = (clone.name || "").trim();
  clone.vorname = (clone.vorname || "").trim();
  clone.geschlecht = clone.geschlecht || "w";
  clone.passbild = clone.passbild || "";
  clone.strasse = clone.strasse || "";
  clone.plz = clone.plz || "";
  clone.ort = clone.ort || "Berlin";
  clone.telefon = clone.telefon || "";
  clone.handy = clone.handy || "";
  clone.email = clone.email || "";

  clone.geburtstag = parseLegacyDate(clone.geburtstag);
  clone.geburtstag = ensureMinimumAge(clone.geburtstag);
  clone.eintrittsdatum = parseLegacyDate(clone.eintrittsdatum);
  clone.austrittsdatum = parseLegacyDate(clone.austrittsdatum);

  clone.austrittsgrund = clone.austrittsgrund === null || clone.austrittsgrund === undefined || clone.austrittsgrund === ""
    ? null
    : Number(clone.austrittsgrund);
  clone.interessengruppen = Array.isArray(clone.interessengruppen)
    ? clone.interessengruppen.map(value => Number(value)).filter(value => Number.isFinite(value))
    : [];
  clone.gruppenwahl = clone.gruppenwahl || "";
  clone.funktion = clone.funktion || "";

  clone.auswahl = asBoolean(clone.auswahl);
  clone.ausweisErteilt = asBoolean(clone.ausweisErteilt);
  clone.clubzugehoerigkeit = Number(clone.clubzugehoerigkeit) || 0;
  clone.weihnachtsessen = Number(clone.weihnachtsessen) || 0;
  clone.wnEssenBezahlt = asBoolean(clone.wnEssenBezahlt);
  clone.beitragClubBezahlt = asBoolean(clone.beitragClubBezahlt);
  clone.betragClubBar = parseLegacyCurrency(clone.betragClubBar);
  clone.beitragComputerBezahlt = asBoolean(clone.beitragComputerBezahlt);
  clone.betragComputerBar = parseLegacyCurrency(clone.betragComputerBar);
  clone.preisClub = parseLegacyCurrency(clone.preisClub);
  clone.gezahlterBetragClub = parseLegacyCurrency(clone.gezahlterBetragClub);
  clone.einzahlungClubAm = parseLegacyDate(clone.einzahlungClubAm);
  clone.preisComputer = parseLegacyCurrency(clone.preisComputer);
  clone.gezahlterBetragComputer = parseLegacyCurrency(clone.gezahlterBetragComputer);
  clone.einzahlungComputerAm = parseLegacyDate(clone.einzahlungComputerAm);
  clone.preisWeihnachten = parseLegacyCurrency(clone.preisWeihnachten);
  clone.gezahlterBetragWeihnachten = parseLegacyCurrency(clone.gezahlterBetragWeihnachten);
  clone.bemerkung = clone.bemerkung || "";
  clone.tischnummer = Number(clone.tischnummer) || 0;

  return clone;
};

const seedMembers = () => [
  {
    id: 191,
    name: "Mogelmann",
    vorname: "Sigrid",
    geschlecht: "w",
    passbild: "\\\\SENIORENWOLKE\\Mitgliederdatenbank\\Passbilder\\Mogelmann Sigrid.jpg",
    strasse: "Damm 215",
    plz: "13435",
    ort: "Berlin",
    telefon: "476 58 77",
    handy: "0176 45987494",
    email: "mogelfrau08@kabelmail.de",
    geburtstag: parseLegacyDate("3/7/1941"),
    eintrittsdatum: parseLegacyDate("1/2/2015"),
    austrittsdatum: "",
    austrittsgrund: null,
    interessengruppen: [20],
    gruppenwahl: "Publisher",
    funktion: "",
    auswahl: false,
    ausweisErteilt: true,
    clubzugehoerigkeit: 9,
    weihnachtsessen: 2,
    wnEssenBezahlt: false,
    beitragClubBezahlt: true,
    betragClubBar: 0,
    beitragComputerBezahlt: false,
    betragComputerBar: 0,
    preisClub: parseLegacyCurrency("30,00 €"),
    gezahlterBetragClub: 30,
    einzahlungClubAm: "",
    preisComputer: 2,
    gezahlterBetragComputer: 0,
    einzahlungComputerAm: "",
    preisWeihnachten: 3,
    gezahlterBetragWeihnachten: 0,
    bemerkung: "",
    tischnummer: 7
  },
  {
    id: 245,
    name: "Vogt",
    vorname: "Markus",
    geschlecht: "m",
    passbild: "\\\\SENIORENWOLKE\\Mitgliederdatenbank\\Passbilder\\Vogt Markus.jpg",
    strasse: "Am Kraehenberg 20",
    plz: "13505",
    ort: "Berlin",
    telefon: "491 44 82",
    handy: "0157 73160455",
    email: "",
    geburtstag: parseLegacyDate("27/7/1949"),
    eintrittsdatum: parseLegacyDate("1/1/2014"),
    austrittsdatum: "",
    austrittsgrund: null,
    interessengruppen: [15],
    gruppenwahl: "Tischtennis 2",
    funktion: "",
    auswahl: false,
    ausweisErteilt: true,
    clubzugehoerigkeit: 9,
    weihnachtsessen: 1,
    wnEssenBezahlt: false,
    beitragClubBezahlt: true,
    betragClubBar: 0,
    beitragComputerBezahlt: false,
    betragComputerBar: 0,
    preisClub: parseLegacyCurrency("0,00 €"),
    gezahlterBetragClub: 0,
    einzahlungClubAm: "",
    preisComputer: 2,
    gezahlterBetragComputer: 0,
    einzahlungComputerAm: "",
    preisWeihnachten: 3,
    gezahlterBetragWeihnachten: 0,
    bemerkung: "",
    tischnummer: 0
  },
  {
    id: 221,
    name: "Vogt",
    vorname: "Tim",
    geschlecht: "m",
    passbild: "\\\\SENIORENWOLKE\\Mitgliederdatenbank\\Passbilder\\Vogt Tim.jpg",
    strasse: "Zabel-Krueger-Damm 58",
    plz: "13469",
    ort: "Berlin",
    telefon: "402 49 29",
    handy: "",
    email: "",
    geburtstag: parseLegacyDate("21/6/1960"),
    eintrittsdatum: parseLegacyDate("1/1/2018"),
    austrittsdatum: parseLegacyDate("31/12/2021"),
    austrittsgrund: 3,
    interessengruppen: [5],
    gruppenwahl: "Kartenspiel",
    funktion: "",
    auswahl: true,
    ausweisErteilt: false,
    clubzugehoerigkeit: 9,
    weihnachtsessen: 2,
    wnEssenBezahlt: false,
    beitragClubBezahlt: true,
    betragClubBar: 0,
    beitragComputerBezahlt: false,
    betragComputerBar: 0,
    preisClub: parseLegacyCurrency("30,00 €"),
    gezahlterBetragClub: 30,
    einzahlungClubAm: parseLegacyDate("13/12/2019"),
    preisComputer: 2,
    gezahlterBetragComputer: 0,
    einzahlungComputerAm: "",
    preisWeihnachten: 3,
    gezahlterBetragWeihnachten: 0,
    bemerkung: "",
    tischnummer: 9
  },
  {
    id: 393,
    name: "Lutta",
    vorname: "Klaus",
    geschlecht: "m",
    passbild: "\\\\SENIORENWOLKE\\Mitgliederdatenbank\\Passbilder\\Lutta Klaus.jpg",
    strasse: "Enkircher Str. 52",
    plz: "13465",
    ort: "Berlin",
    telefon: "407 09 833",
    handy: "",
    email: "",
    geburtstag: parseLegacyDate("31/5/1953"),
    eintrittsdatum: "",
    austrittsdatum: "",
    austrittsgrund: null,
    interessengruppen: [9],
    gruppenwahl: "Schach",
    funktion: "",
    auswahl: false,
    ausweisErteilt: false,
    clubzugehoerigkeit: 3,
    weihnachtsessen: 0,
    wnEssenBezahlt: false,
    beitragClubBezahlt: false,
    betragClubBar: 0,
    beitragComputerBezahlt: false,
    betragComputerBar: 0,
    preisClub: parseLegacyCurrency("0,00 €"),
    gezahlterBetragClub: 0,
    einzahlungClubAm: "",
    preisComputer: 2,
    gezahlterBetragComputer: 0,
    einzahlungComputerAm: "",
    preisWeihnachten: 3,
    gezahlterBetragWeihnachten: 0,
    bemerkung: "",
    tischnummer: 0
  }
];

const generateRandomMember = usedIds => {
  const firstNamesM = ["Hans", "Peter", "Thomas", "Michael", "Stefan", "Uwe", "Juergen", "Ralf", "Dirk", "Markus", "Andreas", "Frank"];
  const firstNamesW = ["Sabine", "Petra", "Monika", "Claudia", "Birgit", "Anja", "Heike", "Kerstin", "Renate", "Silke", "Ute", "Gabriele"];
  const lastNames = ["Schmidt", "Mueller", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schulz", "Krause", "Neumann", "Hartmann", "Lange"];
  const streets = [
    "Alt-Tegel",
    "Berliner Str.",
    "Holzhauser Str.",
    "Karolinenstr.",
    "Miraustr.",
    "Tile-Bruegge-Weg",
    "Waldseeweg",
    "Scharnweberstr.",
    "Buddestr.",
    "Waidmannsluster Damm"
  ];
  const plzList = ["13403", "13407", "13409", "13435", "13437", "13439", "13465", "13467", "13469", "13503", "13505", "13507", "13509"];
  const ortList = ["Berlin", "Berlin", "Berlin", "Berlin", "Hennigsdorf", "Glienicke", "Potsdam"];
  const functions = ["", "", "", "Beisitzer", "Kassenwart", "Schriftfuehrer", "Trainer", "Platzwart"];
  const notes = ["", "", "", "Aktiv", "Nur telefonisch erreichbar", "Bitte Beitragsstatus pruefen", "Moechte Newsletter"];

  let id = randomInt(150, 1200);
  while (usedIds.has(id)) {
    id += randomInt(1, 7);
  }

  const gender = Math.random() < 0.52 ? "w" : "m";
  const vorname = gender === "w" ? pick(firstNamesW) : pick(firstNamesM);
  const name = pick(lastNames);
  const street = `${pick(streets)} ${randomInt(1, 220)}`;
  const plz = pick(plzList);
  const ort = pick(ortList);
  const today = new Date();
  const maxBirthday = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate());
  const birthday = randomDateBetween(new Date("1940-01-01"), maxBirthday);
  const entryYear = randomInt(2009, 2025);
  const eintrittsdatum = maybeDateFromYear(entryYear);
  const leaving = Math.random() < 0.14;
  const austrittsdatum = leaving ? randomDateBetween(new Date(`${entryYear + 1}-01-01`), new Date("2026-04-30")) : "";
  const austrittsgrund = leaving ? randomInt(1, 4) : null;
  const interessengruppen = randomGroupIds();
  const gruppenwahl = interessengruppen.length > 0 ? interestGroupMap[interessengruppen[0]] : "";

  const hasClubFee = Math.random() < 0.8;
  const preisClub = hasClubFee ? 30 : 0;
  const beitragClubBezahlt = hasClubFee ? Math.random() < 0.72 : false;
  const gezahlterBetragClub = beitragClubBezahlt ? preisClub : (hasClubFee && Math.random() < 0.35 ? 15 : 0);
  const betragClubBar = beitragClubBezahlt && Math.random() < 0.22 ? gezahlterBetragClub : 0;
  const einzahlungClubAm = beitragClubBezahlt ? maybeDateFromYear(2026) : "";

  const hasComputerFee = Math.random() < 0.45;
  const preisComputer = hasComputerFee ? 20 : 0;
  const beitragComputerBezahlt = hasComputerFee ? Math.random() < 0.66 : false;
  const gezahlterBetragComputer = beitragComputerBezahlt ? preisComputer : (hasComputerFee && Math.random() < 0.25 ? 10 : 0);
  const betragComputerBar = beitragComputerBezahlt && Math.random() < 0.2 ? gezahlterBetragComputer : 0;
  const einzahlungComputerAm = beitragComputerBezahlt ? maybeDateFromYear(2026) : "";

  const weihnachtsessen = Math.random() < 0.3 ? 0 : (Math.random() < 0.82 ? 1 : 2);
  const preisWeihnachten = weihnachtsessen === 0 ? 0 : (weihnachtsessen === 1 ? 18 : 36);
  const wnEssenBezahlt = preisWeihnachten > 0 ? Math.random() < 0.76 : false;
  const gezahlterBetragWeihnachten = wnEssenBezahlt ? preisWeihnachten : 0;

  const telephone = `${randomInt(300, 599)} ${randomInt(10, 99)} ${randomInt(10, 99)}`;
  const mobile = Math.random() < 0.1 ? "" : `01${randomInt(50, 79)} ${randomInt(10000000, 99999999)}`;
  const email = Math.random() < 0.14 ? "" : `${sanitizeForEmail(vorname)}.${sanitizeForEmail(name)}${id}@verein-mail.de`;

  return normalizeMember({
    id,
    name,
    vorname,
    geschlecht: gender,
    passbild: `\\\\SENIORENWOLKE\\Mitgliederdatenbank\\Passbilder\\${name} ${vorname}.jpg`,
    strasse: street,
    plz,
    ort,
    telefon: telephone,
    handy: mobile,
    email,
    geburtstag: birthday,
    eintrittsdatum,
    austrittsdatum,
    austrittsgrund,
    interessengruppen,
    gruppenwahl,
    funktion: pick(functions),
    auswahl: Math.random() < 0.25,
    ausweisErteilt: Math.random() < 0.88,
    clubzugehoerigkeit: randomInt(1, 9),
    weihnachtsessen,
    wnEssenBezahlt,
    beitragClubBezahlt,
    betragClubBar,
    beitragComputerBezahlt,
    betragComputerBar,
    preisClub,
    gezahlterBetragClub,
    einzahlungClubAm,
    preisComputer,
    gezahlterBetragComputer,
    einzahlungComputerAm,
    preisWeihnachten,
    gezahlterBetragWeihnachten,
    bemerkung: pick(notes),
    tischnummer: weihnachtsessen > 0 ? randomInt(1, 20) : 0
  });
};

const createInitialMembers = targetCount => {
  const members = seedMembers().map(normalizeMember);
  const usedIds = new Set(members.map(member => member.id));

  while (members.length < targetCount) {
    const generated = generateRandomMember(usedIds);
    members.push(generated);
    usedIds.add(generated.id);
  }

  return members;
};

export { createInitialMembers };