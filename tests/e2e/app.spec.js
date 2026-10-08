import { expect, test } from "@playwright/test";

// Das Beitragsjahr ist das Kalenderjahr - die Tests rechnen relativ dazu
const beitragsjahr = new Date().getFullYear();

const referenceData = {
  interestGroups: [
    { id: 16, label: "Excel" },
    { id: 4, label: "Computer" },
    { id: 24, label: "Gesprächskreis Aktuelles" }
  ],
  seniorClubs: [
    { id: 8, name: "Gäste" },
    { id: 9, name: "Lübars" }
  ],
  exitReasons: [{ id: 3, label: "Kündigung" }],
  functions: [
    { id: 1, label: "Vorstand" },
    { id: 3, label: "Gruppenleiter" }
  ]
};

const members = [
  {
    id: 1,
    name: "Müller",
    vorname: "Anna",
    geschlecht: "w",
    geburtstag: "1960-02-03",
    eintrittsdatum: "2025-11-01",
    strasse: "Alt-Lübars 8",
    hasPassbildInDb: true,
    ort: "Berlin",
    clubzugehoerigkeit: 9,
    interessengruppen: [16],
    funktionen: [1],
    funktion: "1",
    beitragClubBezahlt: true,
    beitragComputerBezahlt: true,
    gezahlterBetragClub: 30,
    einzahlungClubAm: "2026-01-15",
    gezahlterBetragComputer: 20,
    einzahlungComputerAm: "2026-01-15"
  },
  {
    id: 2,
    name: "Gästefreund",
    vorname: "Bert",
    geschlecht: "m",
    geburtstag: "1955-06-01",
    ort: "Berlin",
    clubzugehoerigkeit: 8,
    interessengruppen: [],
    funktionen: []
  },
  {
    id: 4,
    name: "Schmidt",
    vorname: "Clara",
    geschlecht: "w",
    geburtstag: "1958-04-12",
    eintrittsdatum: "2020-03-01",
    austrittsdatum: "2025-07-15",
    austrittsgrund: 3,
    ort: "Berlin",
    clubzugehoerigkeit: 9,
    interessengruppen: [],
    funktionen: []
  },
  {
    id: 5,
    name: "Ehemalig",
    vorname: "Gerda",
    geschlecht: "w",
    geburtstag: "1957-03-09",
    eintrittsdatum: "2019-01-01",
    austrittsdatum: "2023-05-31",
    austrittsgrund: 6,
    ort: "Berlin",
    clubzugehoerigkeit: 8,
    interessengruppen: [],
    funktionen: []
  }
];

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify(body)
});

const mockMemberApi = async (page, { initialDataGate = null, referenceDataFailures = 0, staleToken = "" } = {}) => {
  const currentReferenceData = structuredClone(referenceData);
  const geocodeEntries = {};
  const participantsByEvent = {
    warnemuende: [{ id: 1, name: "Müller", vorname: "Anna", essensauswahl: "Zander", bezahlt: false, abgesagt: false, bemerkung: "", mitgliedId: 1 }],
    eisbeinessen: [{ id: 1, name: "Müller", vorname: "Anna", bezahlt: false, abgesagt: false, bemerkung: "", mitgliedId: 1 }]
  };
  let remainingReferenceDataFailures = referenceDataFailures;
  const collections = {
    "interest-groups": { key: "interestGroups", labelKey: "label" },
    "functions": { key: "functions", labelKey: "label" },
    "exit-reasons": { key: "exitReasons", labelKey: "label" },
    "senior-clubs": { key: "seniorClubs", labelKey: "name" }
  };
  await page.route("**/mitgliederverwaltung/php-api/index.php/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.split("/index.php")[1] || "";

    if (apiPath === "/api/session" && request.method() === "POST") {
      return json(route, {
        token: "e2e-token",
        user: { id: 1, username: "admin", role: "admin", passwordChangeRequired: false }
      });
    }
    if (apiPath === "/api/session" && request.method() === "DELETE") return json(route, null, 204);
    if (apiPath === "/api/session" && request.method() === "GET") {
      return staleToken && (request.headers()["x-auth-token"] || "") === staleToken
        ? json(route, { error: "Anmeldung erforderlich." }, 401)
        : json(route, { user: { id: 1, username: "admin", role: "admin", passwordChangeRequired: false } });
    }
    if (apiPath === "/api/reference-data") {
      await initialDataGate;
      if (remainingReferenceDataFailures > 0) {
        remainingReferenceDataFailures -= 1;
        return json(route, { error: "Stammdaten vorübergehend nicht erreichbar" }, 503);
      }
      return json(route, currentReferenceData);
    }
    const collectionMatch = apiPath.match(/^\/api\/reference-data\/([a-z-]+)$/);
    if (collectionMatch && request.method() === "GET") {
      const collection = collections[collectionMatch[1]];
      return collection
        ? json(route, { items: currentReferenceData[collection.key].map(item => ({ ...item, label: item[collection.labelKey], active: true })) })
        : json(route, { error: "Unbekannte Stammdatenart" }, 404);
    }
    const resourceMatch = apiPath.match(/^\/api\/reference-data\/([a-z-]+)\/(\d+)$/);
    if (resourceMatch && request.method() === "PUT") {
      const [, type, idText] = resourceMatch;
      const collection = collections[type];
      const item = collection && currentReferenceData[collection.key].find(entry => entry.id === Number(idText));
      if (!item) return json(route, { error: "Stammdatensatz nicht gefunden" }, 404);
      item[collection.labelKey] = request.postDataJSON().label;
      return json(route, { item: { id: item.id, label: item[collection.labelKey], active: true } });
    }
    const eventCollectionMatch = apiPath.match(/^\/api\/([a-z]+)-participants$/);
    if (eventCollectionMatch && participantsByEvent[eventCollectionMatch[1]]) {
      const participants = participantsByEvent[eventCollectionMatch[1]];
      if (request.method() === "GET") {
        await initialDataGate;
        return json(route, { participants });
      }
      const participant = { id: Math.max(0, ...participants.map(entry => entry.id)) + 1, ...request.postDataJSON() };
      participants.push(participant);
      return json(route, { participant }, 201);
    }
    const eventResourceMatch = apiPath.match(/^\/api\/([a-z]+)-participants\/(\d+)$/);
    if (eventResourceMatch && participantsByEvent[eventResourceMatch[1]]) {
      const participants = participantsByEvent[eventResourceMatch[1]];
      const index = participants.findIndex(entry => entry.id === Number(eventResourceMatch[2]));
      if (index < 0) return json(route, { error: "Teilnehmer nicht gefunden." }, 404);
      if (request.method() === "DELETE") {
        participants.splice(index, 1);
        return json(route, null, 204);
      }
      participants[index] = { ...participants[index], ...request.postDataJSON() };
      return json(route, { participant: participants[index] });
    }
    if (apiPath === "/api/members/1/photo") {
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
    }
    if (apiPath === "/api/geocode-cache") {
      if (request.method() === "GET") return json(route, { entries: geocodeEntries });
      const { key, result } = request.postDataJSON();
      geocodeEntries[key] = result;
      return json(route, null, 204);
    }
    if (apiPath === "/api/member-changes") return json(route, { changes: [] });
    if (/^\/api\/members\/\d+\/changes$/.test(apiPath)) return json(route, { changes: [] });
    if (apiPath === "/api/members" && request.method() === "GET") {
      await initialDataGate;
      return json(route, { members });
    }
    if (apiPath === "/api/members" && request.method() === "POST") {
      return json(route, { member: { ...request.postDataJSON(), id: 3 } }, 201);
    }
    return json(route, { error: `Nicht gemockter E2E-Endpunkt: ${request.method()} ${apiPath}` }, 500);
  });
};

// Wie bei Adressen im Umland: mit "Berlin" findet Nominatim nichts, erst die Ausweichsuche ohne Ort trifft
const mockGeocoding = (page, onRequest = () => {}) => page.route("https://nominatim.openstreetmap.org/search*", route => {
  onRequest();
  const found = !new URL(route.request().url()).searchParams.get("q").includes("Berlin");
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(found ? [{ lon: "13.3423", lat: "52.6137", address: { house_number: "8" } }] : [])
  });
});

const openAuthenticatedApp = async page => {
  await mockMemberApi(page);
  await page.goto("./");
  await expect(page.locator("#loginModal")).toHaveClass(/show/);
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();
  // Vite und die Grids brauchen beim kalten Start länger als die Dialoganimation.
  await expect(page.locator("#appShell")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#loginModal")).toBeHidden();
  await expect(page.locator("#currentUserName")).toHaveText("admin");
};

const clickYearBar = async (page, selector, year) => {
  const canvas = page.locator(selector);
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`Diagramm ${selector} ist nicht sichtbar.`);
  const index = year - (new Date().getFullYear() - 9);
  const chartLeft = box.width * 0.08;
  const chartWidth = box.width * 0.9;
  const position = { x: chartLeft + (index + 0.5) * chartWidth / 10, y: box.height * 0.75 };
  await expect.poll(async () => {
    await canvas.hover({ position });
    return canvas.evaluate(element => element.style.cursor);
  }).toBe("pointer");
  await canvas.click({ position });
};

test("Login lädt Dashboard und UTF-8-Stammdaten", async ({ page }) => {
  await openAuthenticatedApp(page);

  await expect(page.locator("#metricTotal")).toHaveText("1");
  await expect(page.locator("#metricGuestCount")).toHaveText("1");
  await expect(page.locator("#metricClubPaidBtn .metric-label")).toHaveText(`Club bezahlt ${beitragsjahr}`);
  await expect(page.locator("#metricClubOpenBtn .metric-label")).toHaveText(`Club offen ${beitragsjahr}`);
  await expect(page.locator("#metricComputerPaidBtn .metric-label")).toHaveText(`Computergruppe bezahlt ${beitragsjahr}`);
  await expect(page.locator("#metricComputerOpenBtn .metric-label")).toHaveText(`Computergruppe offen ${beitragsjahr}`);
  await expect(page.locator("#metricClubPaymentsLabel")).toHaveText(`Einzahlungen Club ${beitragsjahr}`);
  await expect(page.locator("#metricComputerPaymentsLabel")).toHaveText(`Einzahlungen Computerclub ${beitragsjahr}`);
  await expect(page.locator("#payments-tab .sidebar__nav-label")).toHaveText("Clubbeitrag");
  const paymentsPosition = await page.locator("#payments-tab").boundingBox();
  const guestsPosition = await page.locator("#guests-tab").boundingBox();
  expect(paymentsPosition?.y).toBeLessThan(guestsPosition?.y);
  await expect(page.locator("#newestMemberList")).toContainText("Anna Müller");
  await expect(page.locator("#newestMemberList")).toContainText("66 Jahre");
  await expect(page.locator("#newestMemberList")).toContainText("Eintritt 01.11.2025");
  await expect(page.locator("#newestMemberList .newest-member-photo")).toBeVisible();
  await expect(page.locator("#entryChart")).toBeVisible();
  await expect(page.locator("#entryChart")).toHaveAttribute("aria-label", /Eintritte pro Jahr von \d{4} bis \d{4}/);
  await expect(page.locator("#exitChart")).toBeVisible();
  await expect(page.locator("#exitChart")).toHaveAttribute("aria-label", /Austritte pro Jahr von \d{4} bis \d{4}/);

  await page.locator("#metricGuestCountBtn").click();
  await expect(page.locator("#guests-tab")).toHaveClass(/active/);
  await expect(page.locator("#guestsGrid")).toContainText("Gästefreund");
  await expect(page.locator("#guestsGrid")).toContainText("Bert");

  await page.locator("#dashboard-tab").click();
  await page.locator("#metricTotalBtn").click();
  await expect(page.locator("#overview-tab")).toHaveClass(/active/);
  await expect(page.locator("#overviewGrid")).toContainText("Müller");
  await expect(page.locator("#overviewGrid")).toContainText("Anna");
  await expect(page.locator('#overviewGrid [role="columnheader"][col-id="eintrittsdatum"]')).toContainText("Eintrittsdatum");

  await page.locator("#payments-tab").click();
  const computerToggle = page.locator("#togglePaymentComputerGroupsBtn");
  const clubOpenToggle = page.locator("#togglePaymentClubOpenBtn");
  await expect(computerToggle).toHaveText("Nur Computergruppen");
  await expect(clubOpenToggle).toHaveText("Nur Club offen");
  await computerToggle.click();
  await expect(computerToggle).toHaveAttribute("aria-pressed", "true");
  await expect(computerToggle).toHaveClass(/active/);
  await clubOpenToggle.click();
  await expect(computerToggle).toHaveAttribute("aria-pressed", "true");
  await expect(clubOpenToggle).toHaveAttribute("aria-pressed", "true");

  // Die Schalter merkt sich der Browser
  await clubOpenToggle.click();
  await page.reload();
  await page.locator("#payments-tab").click();
  await expect(computerToggle).toHaveAttribute("aria-pressed", "true");
  await expect(computerToggle).toHaveClass(/active/);
  await expect(clubOpenToggle).toHaveAttribute("aria-pressed", "false");
});

test("Dashboard wird erst mit vollständig geladenen Startdaten angezeigt", async ({ page }) => {
  let releaseInitialData;
  const initialDataGate = new Promise(resolve => { releaseInitialData = resolve; });
  await mockMemberApi(page, { initialDataGate });
  await page.goto("./");
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();

  await expect(page.locator("#loginModal")).not.toHaveClass(/show/);
  await expect(page.locator("#appShell")).toBeHidden();

  releaseInitialData();
  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#metricTotal")).toHaveText("1");
  await expect(page.locator("#groupChart")).toBeVisible();
});

test("Dashboard-Listen passen sich schmalen Spalten ohne Überlauf an", async ({ page }) => {
  await page.setViewportSize({ width: 1520, height: 900 });
  await openAuthenticatedApp(page);

  const newestMemberList = page.locator("#newestMemberList");
  await expect.poll(() => newestMemberList.evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length
  )).toBe(1);

  const newestMemberRow = newestMemberList.locator(".newest-member-row").first();
  await newestMemberRow.locator(".newest-member-row__text strong").evaluate(element => {
    element.textContent = "Onya-Djamba Mitglied mit besonders langem Namen";
  });
  await newestMemberRow.locator(".newest-member-row__text > span").evaluate(element => {
    element.textContent = "83 Jahre · Eintritt 11.09.2026";
  });
  expect(await newestMemberRow.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("Jahresdiagramme öffnen die passend gefilterten Mitgliederlisten", async ({ page }) => {
  await openAuthenticatedApp(page);

  await clickYearBar(page, "#entryChart", 2025);
  await expect(page.locator("#overview-tab")).toHaveClass(/active/);
  await expect(page.locator("#overviewGrid .ag-center-cols-container .ag-row")).toHaveCount(1);
  await expect(page.locator("#overviewGrid")).toContainText("Müller");

  await page.locator("#dashboard-tab").click();
  await clickYearBar(page, "#exitChart", 2025);
  await expect(page.locator("#historical-tab")).toHaveClass(/active/);
  await expect(page.locator("#historicalGrid .ag-center-cols-container .ag-row")).toHaveCount(1);
  await expect(page.locator("#historicalGrid")).toContainText("Schmidt");
});

test("vorübergehend fehlende Stammdaten werden erneut geladen", async ({ page }) => {
  await mockMemberApi(page, { referenceDataFailures: 1 });
  await page.goto("./");
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();

  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#metricComputerTotal")).toHaveText("1");
  await expect(page.locator("#metricComputerPaid")).toHaveText("1 (100%)");
});

test("neun Dashboard-Kacheln öffnen die passenden Detailansichten", async ({ page }) => {
  await openAuthenticatedApp(page);
  await expect(page.locator("#dashboard-pane .metric-box--button")).toHaveCount(9);

  const openMetric = async (buttonId, tabId) => {
    await page.locator("#dashboard-tab").click();
    await page.locator(buttonId).click();
    await expect(page.locator(tabId)).toHaveClass(/active/);
  };

  await openMetric("#metricClubPaidBtn", "#payments-tab");
  const beitragsjahr = new Date().getFullYear();
  await expect(page.locator("#paymentsGrid")).toContainText(`Clubbeitrag ${beitragsjahr}`);
  await expect(page.locator("#paymentsGrid")).toContainText(`Computerbeitrag ${beitragsjahr}`);
  await expect(page.locator("#paymentsGrid")).not.toContainText("Gruppen");
  await expect(page.locator("#paymentsGrid")).toContainText("Müller");
  await openMetric("#metricClubOpenBtn", "#payments-tab");
  await expect(page.locator("#paymentsGrid .ag-row")).toHaveCount(0);
  await openMetric("#metricComputerTotalBtn", "#payments-tab");
  await expect(page.locator("#paymentsGrid")).toContainText("Müller");
  await openMetric("#metricComputerPaidBtn", "#payments-tab");
  await expect(page.locator("#paymentsGrid")).toContainText("Müller");
  await openMetric("#metricComputerOpenBtn", "#payments-tab");
  await expect(page.locator("#paymentsGrid .ag-row")).toHaveCount(0);
  await openMetric("#metricMaleCountBtn", "#overview-tab");
  await expect(page.locator("#overviewGrid .ag-row")).toHaveCount(0);
  await openMetric("#metricFemaleCountBtn", "#overview-tab");
  await expect(page.locator("#overviewGrid")).toContainText("Müller");
});

test("Navigation und Dialogaktionen bleiben auf kleinen Bildschirmen erreichbar", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openAuthenticatedApp(page);
  await page.setViewportSize({ width: 375, height: 500 });

  const menuButton = page.locator("#mobileMenuToggle");
  const sidebar = page.locator("#sidebar");
  await expect(menuButton).toBeVisible();
  await expect(sidebar).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await menuButton.click();
  await expect(sidebar).toBeInViewport();
  await expect(page.locator("#addMemberBtn")).toBeInViewport();

  await page.locator("#addMemberBtn").click();
  await expect(sidebar).not.toBeInViewport();
  await expect(page.locator("#memberModal")).toHaveClass(/show/);
  const memberTabs = page.locator("#memberFormTabs .nav-link");
  const saveButton = page.locator('#memberForm button[type="submit"]');
  const cancelButton = page.getByRole("button", { name: "Abbrechen" });
  await expect(memberTabs).toHaveCount(7);
  for (const tab of await memberTabs.all()) {
    await tab.click();
    await expect(saveButton).toBeInViewport();
    await expect(cancelButton).toBeInViewport();
  }
});

test("Spaltenfilter sind sichtbar und lassen sich zurücksetzen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#overview-tab").click();

  const nameFloatingFilter = page.locator('#overviewGrid .ag-floating-filter[col-id="name"]');
  const nameFilter = nameFloatingFilter.getByRole("textbox");
  const clearButton = nameFloatingFilter.getByRole("button", { name: "Filter löschen" });
  await expect(nameFilter).toBeVisible();
  await expect(clearButton).toHaveCount(0);
  await nameFilter.fill("Kein Treffer");
  await expect(page.locator("#overviewGrid .ag-center-cols-container")).not.toContainText("Müller");
  await expect(clearButton).toBeVisible();

  await clearButton.click();
  await expect(clearButton).toHaveCount(0);
  await expect(nameFilter).toHaveValue("");
  await expect(page.locator("#overviewGrid .ag-center-cols-container")).toContainText("Müller");

  await nameFilter.fill("Müller");
  await nameFloatingFilter.getByRole("button", { name: "Filtermenü öffnen" }).click();
  const resetButton = page.getByRole("button", { name: "Zurücksetzen", exact: true });
  await expect(resetButton).toBeVisible();
  await resetButton.click();
  await expect(resetButton).toBeHidden();
  await expect(nameFilter).toHaveValue("");
});

test("Spalten bleiben beim Herausziehen aus dem Grid sichtbar", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#overview-tab").click();

  const nameHeader = page.locator('#overviewGrid [role="columnheader"][col-id="name"]');
  const headerBox = await nameHeader.boundingBox();
  expect(headerBox).not.toBeNull();
  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, headerBox.y + headerBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(nameHeader).toBeVisible();
});

test("Mitgliederliste übernimmt die gewählten Filter in den Download", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#overview-tab").click();

  await page.locator("#globalSearchInput").fill("Anna");
  const nameFloatingFilter = page.locator('#overviewGrid .ag-floating-filter[col-id="name"]');
  const nameFilter = nameFloatingFilter.getByRole("textbox");
  await nameFilter.fill("Müller");
  await expect(nameFloatingFilter.getByRole("button", { name: "Filter löschen" })).toBeVisible();
  await expect(page.locator("#overviewGrid .ag-center-cols-container")).toContainText("Müller");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloadMembersBtn").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString("utf8");

  expect(download.suggestedFilename()).toMatch(/^mitgliederliste-\d{4}-\d{2}-\d{2}\.txt$/);
  expect(content).toContain("GEWÄHLTE FILTER\r\n- Suche: \"Anna\"\r\n- Name: enthält \"Müller\"");
  expect(content).toContain("Anzahl Personen: 1");
  expect(content).toContain("1. Anna Müller");
});

test("Vereinsmaske stapelt Ausweis direkt unter Funktion", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await expect(page.locator("#memberModal")).toHaveClass(/show/);
  await expect(page.locator("#memberModal .modal-dialog")).toHaveClass(/modal-xl/);

  await page.locator("#member-form-verein-tab").click();
  const stack = page.locator("#member-form-verein-pane .member-form-field-stack");
  const functionField = stack.locator(':scope > [data-field-key="funktion"]');
  const badgeField = stack.locator(':scope > [data-field-key="ausweisErteilt"]');

  await expect(stack).toBeVisible();
  await expect(functionField).toBeVisible();
  await expect(badgeField).toBeVisible();
  const [functionBox, badgeBox] = await Promise.all([functionField.boundingBox(), badgeField.boundingBox()]);
  expect(badgeBox.x).toBeCloseTo(functionBox.x, 0);
  expect(badgeBox.y).toBeGreaterThan(functionBox.y + functionBox.height);

  const boardChip = functionField.getByRole("button", { name: "Vorstand" });
  await boardChip.click();
  await expect(boardChip).toHaveAttribute("aria-pressed", "true");
});

test("fehlende Pflichtfelder zeigen einen Toast statt eines Dialogs", async ({ page }) => {
  let dialogShown = false;
  page.on("dialog", dialog => {
    dialogShown = true;
    dialog.dismiss();
  });

  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await expect(page.locator("#memberModal")).toHaveClass(/show/);

  await page.locator('#memberForm button[type="submit"]').click();

  await expect(page.locator(".toast-item__message")).toHaveText("Name und Vorname sind Pflichtfelder.");
  await expect(page.locator("#memberModal")).toHaveClass(/show/);
  expect(dialogShown).toBe(false);
});

test("abgelaufene Sitzung zeigt Hinweis und führt zurück zum Login", async ({ page }) => {
  await openAuthenticatedApp(page);

  await page.route("**/mitgliederverwaltung/php-api/index.php/**", async route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.split("/index.php")[1] || "";
    if (apiPath === "/api/member-changes") {
      return json(route, { error: "Anmeldung erforderlich." }, 401);
    }
    return route.fallback();
  });

  await page.locator("#changes-tab").click();

  await expect(page.locator("#loginModal")).toHaveClass(/show/);
  await expect(page.locator("#loginError")).toHaveText("Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.");
  await expect(page.locator("#appShell")).toBeHidden();
});

test("abgelaufenes Token beim Start lädt nach erneuter Anmeldung auch die Stammdaten", async ({ page }) => {
  await mockMemberApi(page, { staleToken: "abgelaufenes-token" });
  await page.addInitScript(() => localStorage.setItem("mitgliederverwaltung:authToken", "abgelaufenes-token"));
  await page.goto("./");

  await expect(page.locator("#loginModal")).toHaveClass(/show/);
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator("#appShell")).toBeVisible();

  // Ohne geladene Stammdaten bliebe interestGroupMap leer und die Kachel stuende auf 0.
  await expect(page.locator("#metricComputerTotal")).toHaveText("1");
  await expect(page.locator("#metricComputerPaid")).toHaveText("1 (100%)");

  // Ohne initGrids() bliebe die Mitgliederliste leer.
  await page.locator("#overview-tab").click();
  await expect(page.locator("#overviewGrid")).toContainText("Müller");
});

test("Interessengruppen-Chips sind priorisiert sortiert und lassen sich ab-/anwählen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await page.locator("#member-form-verein-tab").click();

  const chips = page.locator("#field-interessengruppen-chips .member-form-selection-chip");
  await expect(chips).toHaveText(["Excel", "Computer", "Gesprächskreis Aktuelles"]);

  const excelChip = chips.filter({ hasText: "Excel" });
  await expect(excelChip).toHaveAttribute("aria-pressed", "false");

  await excelChip.click();
  await expect(excelChip).toHaveAttribute("aria-pressed", "true");
  await expect(excelChip).toHaveClass(/is-selected/);

  await excelChip.click();
  await expect(excelChip).toHaveAttribute("aria-pressed", "false");
  await expect(excelChip).not.toHaveClass(/is-selected/);
});

test("Interessengruppen lassen sich umbenennen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#manageReferenceDataBtn").click();

  const modal = page.locator("#referenceDataModal");
  const pane = modal.locator('[data-reference-type="interest-groups"]');
  await expect(modal).toHaveClass(/show/);
  await pane.locator("tbody tr", { hasText: "Excel" }).getByRole("button", { name: "Umbenennen" }).click();
  const labelInput = pane.locator('[data-reference-field="label"]');
  await expect(labelInput).toHaveValue("Excel");
  await labelInput.fill("Excel Fortgeschritten");
  await pane.getByRole("button", { name: "Speichern" }).click();

  await expect(pane.locator("tbody")).toContainText("Excel Fortgeschritten");
  await modal.getByRole("button", { name: "Schließen" }).click();
  await page.locator("#addMemberBtn").click();
  await page.locator("#member-form-verein-tab").click();
  await expect(page.locator("#field-interessengruppen-chips")).toContainText("Excel Fortgeschritten");
});

test("neues Mitglied wird mit Formulardaten an die API gesendet", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await page.locator("#field-name").fill("Schäfer");
  await page.locator("#field-vorname").fill("Erika");

  const requestPromise = page.waitForRequest(request => {
    const url = new URL(request.url());
    return request.method() === "POST" && url.pathname.endsWith("/index.php/api/members");
  });
  await page.locator('#memberForm button[type="submit"]').click();
  const request = await requestPromise;

  expect(request.postDataJSON()).toMatchObject({ name: "Schäfer", vorname: "Erika", clubzugehoerigkeit: 9 });
  await expect(page.locator("#memberModal")).not.toHaveClass(/show/);
});

test("Beitragshaken folgt Club- und Computerbetrag", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await page.locator("#member-form-zahlungen-tab").click();

  await page.locator("#field-gezahlterBetragClub").fill("7.50");
  await expect(page.locator("#field-beitragClubBezahlt")).toBeChecked();
  await page.locator("#field-gezahlterBetragComputer").fill("20");
  await expect(page.locator("#field-beitragComputerBezahlt")).toBeChecked();
  await page.locator("#field-gezahlterBetragComputer").fill("0");
  await expect(page.locator("#field-beitragComputerBezahlt")).not.toBeChecked();
});

test("Zahlungen-Tab erfasst Beiträge je Beitragsjahr", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await page.locator("#field-name").fill("Schäfer");
  await page.locator("#field-vorname").fill("Erika");
  await page.locator("#member-form-zahlungen-tab").click();

  const yearChip = jahr => page.locator(`#memberPaymentYear [data-year="${jahr}"]`);
  await expect(yearChip(beitragsjahr)).toHaveAttribute("aria-pressed", "true");
  await expect(yearChip(beitragsjahr)).toHaveText(`${beitragsjahr} (aktuell)`);
  await page.locator("#field-gezahlterBetragClub").fill("30");
  await yearChip(beitragsjahr + 1).click();
  await expect(yearChip(beitragsjahr + 1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#field-gezahlterBetragClub")).toHaveValue("");
  await expect(page.locator("#field-beitragClubBezahlt")).not.toBeChecked();
  await page.locator("#field-gezahlterBetragComputer").fill("20");
  await yearChip(beitragsjahr).click();
  await expect(page.locator("#field-gezahlterBetragClub")).toHaveValue("30");
  await expect(page.locator("#field-gezahlterBetragComputer")).toHaveValue("");

  const requestPromise = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/index.php/api/members"));
  await page.locator('#memberForm button[type="submit"]').click();
  const body = (await requestPromise).postDataJSON();

  expect(body).toMatchObject({ gezahlterBetragClub: 30, gezahlterBetragComputer: 0 });
  expect(body.zahlungen).toEqual([{ beitragsjahr: beitragsjahr + 1, gezahlterBetragClub: 0, einzahlungClubAm: "", gezahlterBetragComputer: 20, einzahlungComputerAm: "" }]);
});

test("Weihnachtsessen wird per Chips statt Dropdown ausgewählt", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#addMemberBtn").click();
  await page.locator("#field-name").fill("Schäfer");
  await page.locator("#field-vorname").fill("Erika");
  await page.locator("#member-form-weihnachten-tab").click();

  const chip = value => page.locator(`#field-weihnachtsessen-chips [data-value="${value}"]`);
  await expect(chip("0")).toHaveAttribute("aria-pressed", "false");
  await chip("2").click();
  await expect(chip("2")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("2")).toHaveClass(/is-selected/);
  await expect(chip("0")).toHaveAttribute("aria-pressed", "false");

  const requestPromise = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/index.php/api/members"));
  await page.locator('#memberForm button[type="submit"]').click();
  expect((await requestPromise).postDataJSON()).toMatchObject({ weihnachtsessen: 2 });
});

test("Gäste heißen in der Maske Gast und haben keinen Zahlungen-Reiter", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#guests-tab").click();
  await page.locator('#guestsGrid [row-id="2"] .edit-icon-btn').click();

  await expect(page.locator("#memberModalLabel")).toHaveText("Gast bearbeiten");
  await expect(page.locator("#member-form-zahlungen-tab")).toBeHidden();

  await page.locator("#member-form-verein-tab").click();
  await page.locator("#field-clubzugehoerigkeit").selectOption("9");
  await expect(page.locator("#memberModalLabel")).toHaveText("Mitglied bearbeiten");
  await expect(page.locator("#member-form-zahlungen-tab")).toBeVisible();
});

test("abgelaufene Beitragsjahre sind in der Maske nur zur Ansicht", async ({ page }) => {
  members[0].zahlungen = [{ beitragsjahr: beitragsjahr - 1, gezahlterBetragClub: 25, einzahlungClubAm: "2025-02-01" }];
  try {
    await openAuthenticatedApp(page);
    await page.locator("#overview-tab").click();
    await page.locator('#overviewGrid [row-id="1"] .edit-icon-btn').click();
    await page.locator("#member-form-zahlungen-tab").click();

    await expect(page.locator("#field-gezahlterBetragClub")).toBeEnabled();
    await expect(page.locator("#memberPaymentYearClosed")).toBeHidden();
    await page.locator(`#memberPaymentYear [data-year="${beitragsjahr - 1}"]`).click();
    await expect(page.locator("#field-gezahlterBetragClub")).toHaveValue("25");
    await expect(page.locator("#field-gezahlterBetragClub")).toBeDisabled();
    await expect(page.locator("#field-beitragClubBezahlt")).toBeDisabled();
    await expect(page.locator("#memberPaymentYearClosed")).toBeVisible();

    // Abgeschlossene Jahre gehen beim Speichern gar nicht erst mit
    await page.locator("#member-form-notizen-tab").click();
    await page.locator("#field-bemerkung").fill("geprüft");
    const requestPromise = page.waitForRequest(request => request.method() === "PUT");
    await page.locator('#memberForm button[type="submit"]').click();
    expect((await requestPromise).postDataJSON().zahlungen).toEqual([]);
  } finally {
    delete members[0].zahlungen;
  }
});

test("Events-Gruppe klappt Weihnachtsessen, Warnemünde und Eisbeinessen auf und markiert den aktiven Punkt", async ({ page }) => {
  await openAuthenticatedApp(page);

  const changesPosition = await page.locator("#changes-tab").boundingBox();
  const eventsPosition = await page.locator("#events-group-toggle").boundingBox();
  expect(changesPosition?.y).toBeLessThan(eventsPosition?.y);

  const toggle = page.locator("#events-group-toggle");
  const group = page.locator("#events-group");
  await expect(group).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(group).toBeVisible();
  await expect(page.locator("#christmas-tab")).toBeVisible();
  await expect(page.locator("#warnemuende-tab")).toBeVisible();
  await expect(page.locator("#eisbeinessen-tab")).toBeVisible();

  await page.locator("#christmas-tab").click();
  await expect(page.locator("#christmas-pane")).toBeVisible();

  // Zugeklappt mit aktivem Unterpunkt: der Gruppeneintrag zeigt, wo man gerade ist.
  await toggle.click();
  await expect(group).toBeHidden();
  await expect(page.locator(".sidebar__group")).toHaveClass(/sidebar__group--active/);

  await toggle.click();
  await expect(group).toBeVisible();

  await page.locator("#overview-tab").click();
  await expect(page.locator(".sidebar__group")).not.toHaveClass(/sidebar__group--active/);
});

test("veralteter Spaltenzustand aus dem Browser überschreibt die Reihenfolge nicht", async ({ page }) => {
  await mockMemberApi(page);
  // Stand aus einer früheren Version: Aktionen hinten angepinnt, Foto- und Aktionsspalte fehlen.
  await page.addInitScript(() => window.localStorage.setItem(
    "mitgliederverwaltung:gridColumnState:warnemuende",
    JSON.stringify([
      { colId: "nr", pinned: "left" },
      { colId: "bearbeiten", pinned: "left" },
      { colId: "name" },
      { colId: "vorname" },
      { colId: "essensauswahl" },
      { colId: "bezahlt" },
      { colId: "bemerkung" },
      { colId: "absage", pinned: "right" }
    ])
  ));
  await page.goto("./");
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator("#events-group-toggle").click();
  await page.locator("#warnemuende-tab").click();

  const grid = page.locator("#warnemuendeGrid");
  await expect(grid.locator('[row-id="1"] [col-id="passbild"]')).toBeVisible();
  await expect(grid.locator('[row-id="1"] [col-id="name"]')).toBeVisible();
  const photo = await grid.locator('[row-id="1"] [col-id="passbild"]').boundingBox();
  const actions = await grid.locator('[row-id="1"] [col-id="aktionen"]').boundingBox();
  const number = await grid.locator('[row-id="1"] [col-id="nr"]').boundingBox();
  const name = await grid.locator('[row-id="1"] [col-id="name"]').boundingBox();

  expect(photo?.x).toBeLessThan(actions?.x);
  expect(actions?.x).toBeLessThan(number?.x);
  expect(number?.x).toBeLessThan(name?.x);
});

test("Teilnehmerliste lässt sich als PDF herunterladen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#warnemuende-tab").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#warnemuendeExportBtn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^warnemuende-teilnehmerliste-\d{4}-\d{2}-\d{2}\.pdf$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pdf = Buffer.concat(chunks).toString("latin1");
  expect(pdf.startsWith("%PDF-1.4")).toBeTruthy();
  expect(pdf).toContain(String.raw`(Teilnehmerliste Warnem\374nde) Tj`);
  expect(pdf).toContain(String.raw`(M\374ller) Tj`);
});

test("ausgetretene Gäste stehen in der Ehemaligen-Liste", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#historical-tab").click();

  const grid = page.locator("#historicalGrid");
  await expect(grid).toContainText("Schmidt");
  await expect(grid).toContainText("Ehemalig");
  // Der ausgetretene Gast bleibt als Gast erkennbar.
  await expect(grid.locator(".ag-center-cols-container .ag-row.guest-row")).toHaveCount(1);
});

test("Eventteilnehmer werden unscharf mit Mitgliedern und Gästen abgeglichen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#warnemuende-tab").click();

  const form = page.locator("#warnemuendeForm");
  await form.locator('[name="name"]').fill("Gästefreun");
  await form.getByRole("button", { name: "Hinzufügen" }).click();

  const matchModal = page.locator("#eventMemberMatchModal");
  await expect(matchModal).toHaveClass(/show/);
  await expect(matchModal).toContainText("Ist diese Person gemeint?");
  await expect(matchModal).toContainText("Zum Einfügen anklicken");
  await expect(matchModal).toContainText("Gast · Nr. 2");
  await matchModal.getByRole("button", { name: /Bert Gästefreund/ }).click();

  await expect(matchModal).not.toHaveClass(/show/);
  await expect(page.locator('#warnemuendeGrid [row-id="2"] [col-id="name"]')).toHaveText("Gästefreund");
});

test("Eventteilnehmer ohne Treffer brauchen eine Sicherheitsabfrage", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#eisbeinessen-tab").click();

  const form = page.locator("#eisbeinessenForm");
  await form.locator('[name="name"]').fill("Namenlos");
  await form.locator('[name="vorname"]').fill("Fantasie");
  page.once("dialog", dialog => {
    expect(dialog.message()).toContain("Kein Mitglied oder Gast");
    dialog.dismiss();
  });
  await form.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.locator("#eisbeinessenGrid")).not.toContainText("Namenlos");

  page.once("dialog", dialog => dialog.accept());
  await form.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.locator("#eisbeinessenGrid")).toContainText("Namenlos");
});

test("Warnemünde-Teilnehmer lassen sich anlegen, ändern, absagen und löschen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#warnemuende-tab").click();

  const grid = page.locator("#warnemuendeGrid");
  const summary = page.locator("#warnemuendeSummary");
  await expect(grid).toContainText("Müller");
  await expect(grid.locator('[row-id="1"] [col-id="nr"]')).toHaveText("1");
  await expect(grid.locator('[row-id="1"] [col-id="passbild"] .member-photo')).toBeVisible();
  await expect(summary).toHaveText("1 Teilnehmer · Zander: 1 · Rind: 0 · Vegie: 0 · bezahlt: 0");

  const form = page.locator("#warnemuendeForm");
  await form.locator('[name="name"]').fill("Gästefreund");
  await form.locator('[name="vorname"]').fill("Bert");
  await form.getByRole("button", { name: "Rind", exact: true }).click();
  await form.locator('[name="bemerkung"]').fill("kommt später");
  await form.getByRole("button", { name: "Hinzufügen" }).click();

  await expect(grid).toContainText("Gästefreund");
  await expect(grid.locator('[row-id="2"] [col-id="bemerkung"]')).toHaveText("kommt später");
  await expect(grid.locator('[row-id="2"] [col-id="nr"]')).toHaveText("2");

  // Die Nummer ist eine Platzangabe: nicht sortierbar, die Liste bleibt in Anmeldereihenfolge.
  await grid.locator('[col-id="nr"].ag-header-cell').first().click();
  await expect(grid.locator('.ag-center-cols-container [row-index="0"] [col-id="name"]')).toHaveText("Müller");
  await expect(grid.locator('[row-id="1"] [col-id="nr"]')).toHaveText("1");

  // Nach einer Sortierung zaehlt sie weiterhin von oben nach unten durch.
  await grid.locator('[col-id="name"].ag-header-cell').first().click();
  await expect(grid.locator('.ag-center-cols-container [row-index="0"] [col-id="name"]')).toHaveText("Gästefreund");
  await expect(grid.locator('[row-id="2"] [col-id="nr"]')).toHaveText("1");
  await expect(grid.locator('[row-id="1"] [col-id="nr"]')).toHaveText("2");
  await grid.locator('[col-id="name"].ag-header-cell').first().click();
  await grid.locator('[col-id="name"].ag-header-cell').first().click();
  await expect(grid.locator('[row-id="1"] [col-id="nr"]')).toHaveText("1");
  await expect(summary).toHaveText("2 Teilnehmer · Zander: 1 · Rind: 1 · Vegie: 0 · bezahlt: 0");

  await grid.locator('[row-id="2"] [col-id="bezahlt"] input[type="checkbox"]').click();
  await expect(summary).toHaveText("2 Teilnehmer · Zander: 1 · Rind: 1 · Vegie: 0 · bezahlt: 1");

  const mealCell = grid.locator('[row-id="2"] [col-id="essensauswahl"]');
  await expect(mealCell.getByRole("button", { name: "Rind", exact: true })).toHaveAttribute("aria-pressed", "true");
  await mealCell.getByRole("button", { name: "Vegie", exact: true }).click();
  await expect(mealCell.getByRole("button", { name: "Vegie", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(summary).toHaveText("2 Teilnehmer · Zander: 1 · Rind: 0 · Vegie: 1 · bezahlt: 1");

  const editModal = page.locator("#warnemuendeEditModal");
  await grid.locator('[row-id="2"]').getByRole("button", { name: "Teilnehmer bearbeiten" }).click();
  await expect(editModal).toHaveClass(/show/);
  await expect(editModal.locator('[name="vorname"]')).toHaveValue("Bert");
  await editModal.locator('[name="vorname"]').fill("Berta");
  await editModal.locator('[name="bemerkung"]').fill("sitzt vorne");
  await editModal.getByRole("button", { name: "Speichern" }).click();

  await expect(editModal).not.toHaveClass(/show/);
  await expect(grid.locator('[row-id="2"] [col-id="vorname"]')).toHaveText("Berta");
  await expect(grid.locator('[row-id="2"] [col-id="bemerkung"]')).toHaveText("sitzt vorne");

  // Absagen statt loeschen: der Eintrag bleibt stehen, verliert aber seine Nummer.
  await grid.locator('[row-id="2"]').getByRole("button", { name: "Teilnehmer absagen" }).click();
  await expect(grid).toContainText("Gästefreund");
  await expect(grid.locator('[row-id="2"]').first()).toHaveClass(/event-abgesagt-row/);
  await expect(grid.locator('[row-id="2"] [col-id="name"]')).toHaveCSS("text-decoration-line", "line-through");
  await expect(grid.locator('[row-id="2"] [col-id="name"]')).toHaveCSS("text-decoration-color", "rgb(180, 69, 63)");
  await expect(grid.locator('[row-id="2"] [col-id="name"]')).toHaveCSS("text-decoration-thickness", "2px");
  await expect(grid.locator('[row-id="2"] [col-id="nr"]')).toHaveText("");
  await expect(summary).toHaveText("1 Teilnehmer · 1 abgesagt · Zander: 1 · Rind: 0 · Vegie: 0 · bezahlt: 0");

  const hideCancelled = page.locator("#warnemuendeHideCancelledBtn");
  await hideCancelled.click();
  await expect(hideCancelled).toHaveAttribute("aria-pressed", "true");
  await expect(hideCancelled).toHaveClass(/active/);
  await expect(grid).not.toContainText("Gästefreund");
  await expect(summary).toHaveText("1 Teilnehmer · 1 abgesagt · Zander: 1 · Rind: 0 · Vegie: 0 · bezahlt: 0");
  await hideCancelled.click();
  await expect(grid).toContainText("Gästefreund");

  await grid.locator('[row-id="2"]').getByRole("button", { name: "Absage zurücknehmen" }).click();
  await expect(grid.locator('[row-id="2"] [col-id="nr"]')).toHaveText("2");
  await expect(summary).toHaveText("2 Teilnehmer · Zander: 1 · Rind: 0 · Vegie: 1 · bezahlt: 1");

  // Loeschen bleibt fuer Fehleintraege moeglich - endgueltig, deshalb mit Rueckfrage.
  page.on("dialog", dialog => dialog.accept());
  await grid.locator('[row-id="2"]').getByRole("button", { name: "Teilnehmer löschen" }).click();
  await expect(grid).not.toContainText("Gästefreund");
  await expect(summary).toHaveText("1 Teilnehmer · Zander: 1 · Rind: 0 · Vegie: 0 · bezahlt: 0");
});

test("Eisbeinessen führt die Liste ohne Essensauswahl und mit 30 Plätzen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#eisbeinessen-tab").click();

  const grid = page.locator("#eisbeinessenGrid");
  const summary = page.locator("#eisbeinessenSummary");
  await expect(grid).toContainText("Müller");
  await expect(grid.locator('[col-id="essensauswahl"]')).toHaveCount(0);
  await expect(page.locator("#eisbeinessenForm .meal-chips")).toHaveCount(0);
  await expect(summary).toHaveText("1 Teilnehmer · bezahlt: 0");

  const form = page.locator("#eisbeinessenForm");
  await form.locator('[name="name"]').fill("Gästefreund");
  await form.locator('[name="vorname"]').fill("Bert");
  await form.getByRole("button", { name: "Hinzufügen" }).click();

  await expect(grid).toContainText("Gästefreund");
  await expect(summary).toHaveText("2 Teilnehmer · bezahlt: 0");

  await grid.locator('[row-id="2"]').getByRole("button", { name: "Teilnehmer absagen" }).click();
  const hideCancelled = page.locator("#eisbeinessenHideCancelledBtn");
  await hideCancelled.click();
  await expect(hideCancelled).toHaveAttribute("aria-pressed", "true");
  await expect(grid).not.toContainText("Gästefreund");
  await hideCancelled.click();
  await expect(grid).toContainText("Gästefreund");

  // Eigene Tabelle: der Warnemuende-Eintrag taucht hier nicht auf.
  await page.locator("#warnemuende-tab").click();
  await expect(page.locator("#warnemuendeGrid")).not.toContainText("Gästefreund");
});

test("Eisbeinessen-Teilnehmerliste lässt sich als PDF herunterladen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#eisbeinessen-tab").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#eisbeinessenExportBtn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^eisbeinessen-teilnehmerliste-\d{4}-\d{2}-\d{2}\.pdf$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pdf = Buffer.concat(chunks).toString("latin1");
  expect(pdf).toContain("(Teilnehmerliste Eisbeinessen) Tj");
  expect(pdf).toContain("(Selbstbeteiligung liegt bei 20 Euro.) Tj");
  expect(pdf.includes("(Essensauswahl) Tj")).toBeFalsy();
});

test("Karte zeigt aktive Mitglieder mit Adresse und öffnet das Mitglied", async ({ page }) => {
  let nominatimRequests = 0;
  await mockGeocoding(page, () => { nominatimRequests += 1; });
  await openAuthenticatedApp(page);
  await page.locator("#member-map-tab").click();
  await expect(page.locator("#memberMapSummary")).toHaveText(/1 von 1 Mitgliedern und 0 von 1 Gästen auf der Karte/);
  await expect(page.locator("#memberMapMissing summary")).toHaveText("1 ohne Kartenposition");
  await page.locator("#memberMapShowGuests").click();
  await expect(page.locator("#memberMapShowGuests")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#memberMapSummary")).toHaveText(/1 von 1 Mitgliedern auf der Karte \(Gäste ausgeblendet\)/);
  await expect(page.locator("#memberMapMissing summary")).toHaveCount(0);
  await page.locator("#memberMapShowGuests").click();
  // Hover reagiert schon neben dem Punkt und zeigt dann die Zeigehand
  const dotBox = await page.locator(".member-map__dot").boundingBox();
  await page.mouse.move(dotBox.x + dotBox.width / 2 + 10, dotBox.y + dotBox.height / 2);
  await expect(page.locator("#memberMapInfo")).toContainText("Alt-Lübars 8");
  await expect(page.locator(".member-map__svg")).toHaveClass(/member-map__svg--on-dot/);
  await expect(page.locator(".member-map__dot")).toHaveClass(/member-map__dot--active/);
  await expect(page.locator("#memberMapInfo .member-map__photo")).toHaveCount(1);
  const viewWidth = async () => Number((await page.locator(".member-map__svg").getAttribute("viewBox")).split(" ")[2]);
  const before = await viewWidth();
  await page.locator('[data-zoom="in"]').click();
  expect(await viewWidth()).toBe(before / 2);
  await page.locator(".member-map__svg").hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(viewWidth).toBeGreaterThan(before / 2);
  await page.locator('[data-zoom="home"]').click();
  expect(await viewWidth()).toBe(before);
  await page.locator(".member-map__dot").hover();
  await page.locator("#memberMapInfo [data-member-id]").click();
  await expect(page.locator("#memberModal")).toBeVisible();

  // Zweites Oeffnen nutzt die zentral gespeicherten Koordinaten und fragt Nominatim nicht erneut
  await page.locator("#memberModal .btn-close").click();
  await expect(page.locator("#memberModal")).toBeHidden();
  await page.locator("#dashboard-tab").click();
  await page.locator("#member-map-tab").click();
  await expect(page.locator(".member-map__dot")).toHaveCount(1);
  expect(nominatimRequests).toBe(2);

  // Klick auf den Punkt oeffnet direkt den Bearbeiten-Dialog
  await page.locator(".member-map__dot").click();
  await expect(page.locator("#memberModal")).toBeVisible();
  await expect(page.locator("#field-name")).toHaveValue("Müller");
  // Chrome soll die Anschrift nicht als eigene Adresse speichern wollen
  await expect(page.locator("#field-plz")).toHaveAttribute("autocomplete", "one-time-code");
  await expect(page.locator("#memberForm")).toHaveAttribute("autocomplete", "off");
  expect(await page.locator("#memberForm").evaluate(form => [...form.querySelectorAll("input:not([type=hidden]), select, textarea")].every(element => /^(mitglied-|one-time-code$)/.test(element.getAttribute("autocomplete"))))).toBe(true);
});

test("Karte blendet Mitglieder aus und merkt sich das im Browser", async ({ page }) => {
  await mockGeocoding(page);
  await openAuthenticatedApp(page);
  await page.locator("#member-map-tab").click();
  await expect(page.locator(".member-map__dot")).toHaveCount(1);

  await page.locator("#memberMapShowMembers").click();
  await expect(page.locator("#memberMapShowMembers")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#memberMapSummary")).toHaveText(/^0 von 1 Gästen auf der Karte \(Mitglieder ausgeblendet\)/);
  await expect(page.locator(".member-map__dot")).toHaveCount(0);
  await page.locator("#memberMapShowGuests").click();
  await expect(page.locator("#memberMapSummary")).toHaveText(/^Niemand auf der Karte \(Mitglieder und Gäste ausgeblendet\)/);

  await page.reload();
  await page.locator("#member-map-tab").click();
  await expect(page.locator("#memberMapShowMembers")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#memberMapShowGuests")).toHaveAttribute("aria-pressed", "false");
});

test("ausgeblendete Gäste verschwinden auch aus der Anzeige rechts", async ({ page }) => {
  await mockMemberApi(page);
  // Nur hier: der Gast wohnt nebenan bzw. mit im Haus von Anna Müller
  const withGuests = [...members, { ...members[1], id: 6, vorname: "Gerd", name: "Nachbar", strasse: "Alt-Lübars 20" }]
    .map(member => member.id === 2 ? { ...member, strasse: "Alt-Lübars 8" } : member);
  await page.route("**/mitgliederverwaltung/php-api/index.php/api/members?*", route => json(route, { members: withGuests }));
  await page.route("https://nominatim.openstreetmap.org/search*", route => {
    const nextDoor = new URL(route.request().url()).searchParams.get("q").includes("Lübars 20");
    return json(route, [{ lon: nextDoor ? "13.3453" : "13.3423", lat: "52.6137", address: { house_number: "8" } }]);
  });
  await page.goto("./");
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator("#member-map-tab").click();
  await expect(page.locator("#memberMapSummary")).toHaveText(/1 von 1 Mitgliedern und 2 von 2 Gästen auf der Karte/);

  const info = page.locator("#memberMapInfo");
  await page.locator(".member-map__dot--gast").hover();
  await expect(info).toContainText("Gerd Nachbar");
  await page.locator("#memberMapShowGuests").click();
  await expect(info).not.toContainText("Gerd Nachbar");
  await expect(info).toContainText("Mit der Maus");

  await page.locator("#memberMapShowGuests").click();
  await page.locator(".member-map__dot:not(.member-map__dot--gast)").hover();
  await expect(info).toContainText("Bert Gästefreund");
  await page.locator("#memberMapShowGuests").click();
  await expect(info).toContainText("Anna Müller");
  await expect(info).not.toContainText("Bert Gästefreund");
});

test("Bearbeiten-Dialog springt zum Wohnort auf der Karte", async ({ page }) => {
  await mockGeocoding(page);
  await openAuthenticatedApp(page);
  await page.locator("#overview-tab").click();
  await page.locator('#overviewGrid [row-id="1"] .edit-icon-btn').click();
  await expect(page.locator("#memberModal")).toBeVisible();
  await page.locator("#memberShowOnMapBtn").click();

  await expect(page.locator("#memberModal")).toBeHidden();
  await expect(page.locator("#member-map-tab")).toHaveClass(/active/);
  await expect(page.locator("#memberMapInfo")).toContainText("Anna Müller");
  await expect(page.locator(".member-map__dot")).toHaveClass(/member-map__dot--active/);
  expect((await page.locator(".member-map__svg").getAttribute("viewBox")).split(" ")[2]).toBe("400");

  // Neue Mitglieder haben noch keine gespeicherte Anschrift, daher kein Kartenknopf
  await page.locator("#addMemberBtn").click();
  await expect(page.locator("#memberModal")).toBeVisible();
  await expect(page.locator("#memberShowOnMapBtn")).toBeHidden();
});

test("Mitgliedsmaske fragt vor dem Verwerfen ungespeicherter Änderungen nach", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#overview-tab").click();
  const modal = page.locator("#memberModal");
  const discardBar = page.locator("#memberFormDiscard");
  const openAnna = async () => {
    const shown = modal.evaluate(element => new Promise(resolve => {
      element.addEventListener("shown.bs.modal", () => resolve(), { once: true });
    }));
    await page.locator('#overviewGrid [row-id="1"] .edit-icon-btn').click();
    await shown;
    await expect(modal).toBeVisible();
  };
  let browserDialog = false;
  page.on("dialog", dialog => { browserDialog = true; dialog.dismiss(); });

  // Ohne Aenderung schliesst der Dialog ohne Rueckfrage
  await openAnna();
  await page.locator("#memberModal .btn-close").click();
  await expect(modal).toBeHidden();

  // Mit Aenderung: Leiste statt Browser-Dialog; "Weiter bearbeiten" behaelt die Eingabe
  await openAnna();
  await page.locator("#field-vorname").fill("Annette");
  await page.locator("#memberModal .member-form-cancel").click();
  await expect(discardBar).toBeVisible();
  await expect(discardBar).toContainText("Es gibt ungespeicherte Änderungen.");
  await expect(page.locator("#memberModal .member-form-cancel")).toBeHidden();
  await discardBar.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await expect(discardBar).toBeHidden();
  await expect(modal).toBeVisible();
  await expect(page.locator("#field-vorname")).toHaveValue("Annette");

  // Das Kreuz fragt ebenfalls, "Verwerfen" schliesst und verwirft
  await page.locator("#memberModal .btn-close").click();
  await discardBar.getByRole("button", { name: "Verwerfen" }).click();
  await expect(modal).toBeHidden();
  await openAnna();
  await expect(page.locator("#field-vorname")).toHaveValue("Anna");
  await expect(discardBar).toBeHidden();

  // Kartenknopf: erst nach "Verwerfen" zur Karte
  await page.locator("#field-vorname").fill("Annette");
  await page.locator("#memberShowOnMapBtn").click();
  await expect(discardBar).toBeVisible();
  await expect(page.locator("#overview-tab")).toHaveClass(/active/);
  await discardBar.getByRole("button", { name: "Verwerfen" }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#member-map-tab")).toHaveClass(/active/);
  expect(browserDialog).toBe(false);
});

test("Plausibilitätsprüfung zeigt Fehler und Warnungen im Hinweisbereich der Maske", async ({ page }) => {
  await openAuthenticatedApp(page);
  const saved = [];
  await page.route("**/mitgliederverwaltung/php-api/index.php/api/members/1", route => {
    saved.push(route.request().postDataJSON());
    return json(route, { member: { ...members[0], ...route.request().postDataJSON(), id: 1 } });
  });
  // OSM kennt die Strasse nur in Schoenfliess
  await page.route("https://nominatim.openstreetmap.org/search*", route => json(route, [{ lon: "13.318", lat: "52.644", address: { house_number: "32", postcode: "16567", village: "Schönfließ" } }]));
  const review = page.locator("#memberFormReview");
  const submit = page.locator('#memberForm button[type="submit"]');
  const openAnna = async () => {
    await page.locator("#overview-tab").click();
    await page.locator('#overviewGrid [row-id="1"] .edit-icon-btn').click();
    await expect(page.locator("#memberModal")).toBeVisible();
  };
  await openAnna();

  // Fehler: blockiert, nennt Reiter und Feld, markiert das Feld und springt zum Reiter
  await page.locator("#member-form-kontakt-tab").click();
  await page.locator("#field-plz").fill("1346");
  await page.locator("#member-form-basis-tab").click();
  await submit.click();
  await expect(review).toHaveClass(/member-form-review--error/);
  await expect(review).toContainText("Bitte korrigieren");
  await expect(review).toContainText("Kontakt › PLZ");
  await expect(page.locator("#member-form-kontakt-tab")).toHaveClass(/active/);
  await expect(page.locator('div[data-field-key="plz"] .member-form-feedback--error')).toHaveText("PLZ muss aus genau 5 Ziffern bestehen.");
  await page.locator("#field-plz").fill("13469");
  await expect(page.locator('div[data-field-key="plz"] .member-form-feedback')).toHaveCount(0);
  await expect(review).toBeHidden();

  // Warnung: OSM schlaegt PLZ und Ort vor, "uebernehmen" fuellt die Felder
  await submit.click();
  await expect(review).toHaveClass(/member-form-review--warning/);
  await expect(review).toContainText("Kontakt › PLZ");
  await expect(review).toContainText("PLZ 13469 passt nicht zur Adresse");
  await expect(submit).toHaveText("Trotzdem speichern");
  expect(saved).toHaveLength(0);
  await review.getByRole("button", { name: "16567 Schönfließ übernehmen" }).click();
  await expect(page.locator("#field-plz")).toHaveValue("16567");
  await expect(page.locator("#field-ort")).toHaveValue("Schönfließ");
  await expect(review).toBeHidden();
  await expect(submit).toHaveText("Speichern");
  await submit.click();
  await expect(page.locator("#memberModal")).toBeHidden();
  expect(saved[0]).toMatchObject({ plz: "16567", ort: "Schönfließ" });

  // "Trotzdem speichern" uebernimmt eine gesehene Warnung beim zweiten Klick
  await openAnna();
  await page.locator("#member-form-kontakt-tab").click();
  await page.locator("#field-telefon").fill("abends");
  await page.locator("#field-handy").fill("so nicht");
  await submit.click();
  await expect(review).toContainText("Kontakt › Telefon");
  await expect(submit).toHaveText("Trotzdem speichern");
  // Korrigiertes Feld verschwindet aus der Liste, der Knopf verlangt eine neue Pruefung
  await page.locator("#field-handy").fill("0171 1234567");
  await expect(review).not.toContainText("Kontakt › Handy");
  await expect(review).toContainText("Kontakt › Telefon");
  await expect(submit).toHaveText("Speichern");
  await submit.click();
  await expect(submit).toHaveText("Trotzdem speichern");
  await page.locator('#memberFormReview [data-review-field="telefon"]').click();
  await expect(page.locator("#field-telefon")).toBeFocused();
  await submit.click();
  await expect(page.locator("#memberModal")).toBeHidden();
  expect(saved[1]).toMatchObject({ telefon: "abends" });
});


const mockDoppelApi = async page => {
  let turniere = [];
  let konflikt = false;
  await page.route('**/index.php/api/turniere**', async route => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, { turniere });
    const body = req.postDataJSON();
    if (req.method() === 'POST') {
      const t = { ...body, id: turniere.length + 1, version: 1, teilnehmer: body.teilnehmer.map((p, i) => ({ ...p, id: i + 1, name: p.spieler.map(s => s.name).join(' / ') })) };
      const ids = t.teilnehmer.map(p => p.id); if (ids.length % 2) ids.push(null);
      t.runden = [];
      for (let r = 0; r < ids.length - 1; r++) {
        const runde = [];
        for (let i = 0; i < ids.length / 2; i++) if (ids[i] && ids[ids.length - 1 - i]) runde.push({ id: `r${r + 1}-s${runde.length + 1}`, a: ids[i], b: ids[ids.length - 1 - i], punkteA: null, punkteB: null, saetze: [], status: 'offen', sieger: null });
        t.runden.push(runde); ids.splice(1, 0, ids.pop());
      }
      turniere.unshift(t); return json(route, { turnier: t }, 201);
    }
    const t = turniere[0];
    if (konflikt || body.version !== t.version) return json(route, { error: 'Das Turnier wurde inzwischen geändert. Bitte neu laden.' }, 409);
    if (req.url().endsWith('/tische')) t.anzahlTische = body.anzahlTische;
    else {
      const s = t.runden.flat().find(s => s.id === new URL(req.url()).pathname.split('/').at(-1));
      const saetze = body.saetze;
      if (saetze.some(s => Math.max(s.a, s.b) < 11 || (Math.max(s.a, s.b) === 11 ? Math.min(s.a, s.b) > 9 : Math.abs(s.a - s.b) !== 2))) return json(route, { error: 'Ein Satz benötigt zwei Punkte Vorsprung.' }, 400);
      s.saetze = saetze; s.punkteA = saetze.length ? saetze.filter(s => s.a > s.b).length : null; s.punkteB = saetze.length ? saetze.filter(s => s.b > s.a).length : null;
      s.status = saetze.length ? 'fertig' : 'offen'; s.sieger = saetze.length ? (s.punkteA > s.punkteB ? s.a : s.b) : null;
    }
    t.version++; return json(route, { turnier: t });
  });
  return { konflikt: () => { konflikt = true; } };
};
const legeDoppelAn = async (page, n = 8) => {
  await openAuthenticatedApp(page); const api = await mockDoppelApi(page);
  await page.locator('#turniere-tab').click(); await expect(page.locator('#turnierNeuLaden')).toBeEnabled();
  await page.locator('#turnierTitel').fill('Tischtennis Herbst');
  if (n === 7) await page.locator('#turnierPaarEntfernen').click();
  const personen = page.locator('#turnierPaare .turnier-person');
  await personen.nth(0).locator('select').selectOption('1');
  for (let i = 1; i < n * 2; i++) await personen.nth(i).locator('input').fill(`Gast ${i}`);
  await page.locator('#turnierForm button[type="submit"]').click();
  await expect(page.locator('#turnierDetails h2')).toHaveText('Tischtennis Herbst'); return api;
};
test('Doppelturnier: Testhilfe füllt acht reine Gastpaare ohne sofortiges Speichern', async ({ page }) => {
  await openAuthenticatedApp(page);
  await mockDoppelApi(page);
  await page.locator('#turniere-tab').click();
  await expect(page.locator('#turnierNeuLaden')).toBeEnabled();
  await page.locator('#turnierPaare select').first().selectOption('1');
  await page.locator('#turnierPaarEntfernen').click();
  await page.locator('#turnierModus').selectOption('ko');
  const erstellt = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/turniere')) erstellt.push(request.postDataJSON());
  });
  await page.getByRole('button', { name: 'Beispielturnier anlegen (Testhilfe)', exact: true }).click();
  await expect(page.locator('#turnierPaare fieldset')).toHaveCount(8);
  await expect(page.locator('#turnierModus')).toHaveValue('jeder-gegen-jeden');
  await expect(page.locator('#turnierForm')).toContainText('keine Vereinsmitgliedschaft nötig');
  await expect(page.locator('#turnierForm')).toContainText('Temporäre Testhilfe');
  const personen = await page.locator('#turnierPaare .turnier-person').evaluateAll(boxes => boxes.map(box => ({
    id: box.querySelector('select').value, name: box.querySelector('input').value,
    disabled: box.querySelector('input').disabled, required: box.querySelector('input').required,
  })));
  expect(personen).toHaveLength(16);
  expect(new Set(personen.map(p => p.name)).size).toBe(16);
  expect(personen.every(p => p.id === '' && p.name.trim() && !p.disabled && p.required)).toBe(true);
  expect(erstellt).toHaveLength(0);
  await page.locator('#turnierForm button[type="submit"]').click();
  await expect(page.locator('#turnierDetails h2')).toHaveText('Beispielturnier – Tischtennis-Doppel');
  await expect(page.locator('#turnierDetails .turnier-spiel')).toHaveCount(28);
  expect(erstellt).toHaveLength(1);
  expect(erstellt[0].teilnehmer.flatMap(p => p.spieler)).toEqual(personen.map(p => ({ name: p.name, mitgliedId: null })));
});

test('Doppelturnier: acht Paare, 28 Spiele, Sätze und Tischanzahl speichern', async ({ page }) => {
  await legeDoppelAn(page);
  await expect(page.locator('#turnierDetails')).toContainText('8 Doppelpaare');
  await expect(page.locator('#turnierDetails .turnier-spiel')).toHaveCount(28);
  const form = page.locator('#turnierDetails .turnier-ergebnis').first();
  for (let i = 0; i < 3; i++) { await form.locator(`[name="satz${i}a"]`).fill('11'); await form.locator(`[name="satz${i}b"]`).fill('8'); }
  await form.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('#turnierDetails')).toContainText('Sätze 3:0');
  await expect(page.locator('#turnierDetails tbody tr').first()).toContainText('Anna Müller');
  await page.locator('#turnierNeuLaden').click();
  await expect(page.locator('#turnierDetails .turnier-ergebnis').first().locator('[name="satz0a"]')).toHaveValue('11');
  await page.getByRole('spinbutton', { name: 'Verfügbare Tische' }).fill('2');
  await page.getByRole('button', { name: 'Tischanzahl speichern' }).click();
  await expect(page.locator('#turnierDetails')).toContainText('Durchgang 2 · Tisch 1');
  await page.locator('#turnierDetails .turnier-ergebnis').first().getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.locator('#turnierDetails .turnier-ergebnis').first().locator('[name="satz0a"]')).toHaveValue('');
});
test('Doppelturnier: sieben Paare, Pausen und ungültige Satzpunkte', async ({ page }) => {
  await legeDoppelAn(page, 7);
  await expect(page.locator('#turnierDetails .turnier-spiel')).toHaveCount(21);
  await expect(page.locator('#turnierDetails')).toContainText('Pause:');
  const form = page.locator('#turnierDetails .turnier-ergebnis').first();
  for (let i = 0; i < 3; i++) { await form.locator(`[name="satz${i}a"]`).fill('11'); await form.locator(`[name="satz${i}b"]`).fill('10'); }
  await form.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('#turnierError')).toContainText('zwei Punkte Vorsprung');
});
test('Doppelturnier: Versionskonflikt überschreibt kein Ergebnis', async ({ page }) => {
  const api = await legeDoppelAn(page); api.konflikt();
  const form = page.locator('#turnierDetails .turnier-ergebnis').first();
  for (let i = 0; i < 3; i++) { await form.locator(`[name="satz${i}a"]`).fill('11'); await form.locator(`[name="satz${i}b"]`).fill('0'); }
  await form.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.locator('#turnierError')).toContainText('Bitte neu laden');
});


test('Schnelle Anmeldung während der Öffnungsanimation schließt den Dialog', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#loginModal .modal-dialog { transition-duration: 2s !important; }';
      document.head.append(style);
    }, { once: true });
    // Ohne actionability-Wartezeit absenden, solange Bootstrap noch öffnet.
    document.addEventListener('show.bs.modal', event => {
      if (event.target.id !== 'loginModal') return;
      document.getElementById('loginUsername').value = 'admin';
      document.getElementById('loginPassword').value = 'passwd';
      document.getElementById('loginForm').requestSubmit();
    }, { once: true });
  });
  await mockMemberApi(page);
  await page.goto('./');
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#loginModal')).toBeHidden();
  await page.locator('#addMemberBtn').click();
  await expect(page.locator('#memberModal')).toBeVisible();
});
