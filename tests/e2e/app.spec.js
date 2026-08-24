import { expect, test } from "@playwright/test";

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
    ort: "Berlin",
    clubzugehoerigkeit: 9,
    interessengruppen: [16],
    funktionen: [1],
    funktion: "1",
    beitragClubBezahlt: true,
    beitragComputerBezahlt: true,
    gezahlterBetragClub: 30,
    einzahlungClubAm: "2026-01-15"
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
  }
];

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify(body)
});

const mockMemberApi = async (page, { initialDataGate = null, referenceDataFailures = 0, staleToken = "" } = {}) => {
  const currentReferenceData = structuredClone(referenceData);
  const participants = [{ id: 1, name: "Müller", vorname: "Anna", essensauswahl: "Zander", bezahlt: false, abgesagt: false, bemerkung: "", mitgliedId: 1 }];
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
    if (apiPath === "/api/warnemuende-participants" && request.method() === "GET") {
      await initialDataGate;
      return json(route, { participants });
    }
    if (apiPath === "/api/warnemuende-participants" && request.method() === "POST") {
      const participant = { id: Math.max(0, ...participants.map(entry => entry.id)) + 1, ...request.postDataJSON() };
      participants.push(participant);
      return json(route, { participant }, 201);
    }
    const participantMatch = apiPath.match(/^\/api\/warnemuende-participants\/(\d+)$/);
    if (participantMatch) {
      const index = participants.findIndex(entry => entry.id === Number(participantMatch[1]));
      if (index < 0) return json(route, { error: "Teilnehmer nicht gefunden." }, 404);
      if (request.method() === "DELETE") {
        participants.splice(index, 1);
        return json(route, null, 204);
      }
      participants[index] = { ...participants[index], ...request.postDataJSON() };
      return json(route, { participant: participants[index] });
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

const openAuthenticatedApp = async page => {
  await mockMemberApi(page);
  await page.goto("./");
  await expect(page.locator("#loginModal")).toHaveClass(/show/);
  await page.locator("#loginUsername").fill("admin");
  await page.locator("#loginPassword").fill("passwd");
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#currentUserName")).toHaveText("admin");
};

test("Login lädt Dashboard und UTF-8-Stammdaten", async ({ page }) => {
  await openAuthenticatedApp(page);

  await expect(page.locator("#metricTotal")).toHaveText("1");
  await expect(page.locator("#metricGuestCount")).toHaveText("1");
  await expect(page.locator("#payments-tab .sidebar__nav-label")).toHaveText("Clubbeitrag");
  const paymentsPosition = await page.locator("#payments-tab").boundingBox();
  const guestsPosition = await page.locator("#guests-tab").boundingBox();
  expect(paymentsPosition?.y).toBeLessThan(guestsPosition?.y);
  await expect(page.locator("#newestMemberList")).toContainText("Anna Müller");
  await expect(page.locator("#newestMemberList")).toContainText("66 Jahre");
  await expect(page.locator("#newestMemberList")).toContainText("Eintritt 01.11.2025");
  await expect(page.locator("#newestMemberList .newest-member-photo")).toBeVisible();

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

test("Events-Gruppe klappt Weihnachtsessen und Warnemünde auf und markiert den aktiven Punkt", async ({ page }) => {
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

test("Warnemünde-Teilnehmer lassen sich anlegen, ändern und absagen", async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.locator("#events-group-toggle").click();
  await page.locator("#warnemuende-tab").click();

  const grid = page.locator("#warnemuendeGrid");
  const summary = page.locator("#warnemuendeSummary");
  await expect(grid).toContainText("Müller");
  await expect(grid.locator('[row-id="1"] [col-id="nr"]')).toHaveText("1");
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
  await expect(grid.locator('[row-id="2"]').first()).toHaveClass(/warnemuende-abgesagt-row/);
  await expect(grid.locator('[row-id="2"] [col-id="nr"]')).toHaveText("");
  await expect(summary).toHaveText("1 Teilnehmer · 1 abgesagt · Zander: 1 · Rind: 0 · Vegie: 0 · bezahlt: 0");

  await grid.locator('[row-id="2"]').getByRole("button", { name: "Absage zurücknehmen" }).click();
  await expect(grid.locator('[row-id="2"] [col-id="nr"]')).toHaveText("2");
  await expect(summary).toHaveText("2 Teilnehmer · Zander: 1 · Rind: 0 · Vegie: 1 · bezahlt: 1");
});
