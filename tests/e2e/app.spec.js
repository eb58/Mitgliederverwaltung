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

const mockMemberApi = async page => {
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
    if (apiPath === "/api/reference-data") return json(route, referenceData);
    if (apiPath === "/api/member-changes") return json(route, { changes: [] });
    if (/^\/api\/members\/\d+\/changes$/.test(apiPath)) return json(route, { changes: [] });
    if (apiPath === "/api/members" && request.method() === "GET") return json(route, { members });
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

  await page.locator("#overview-tab").click();
  await expect(page.locator("#overviewGrid")).toContainText("Müller");
  await expect(page.locator("#overviewGrid")).toContainText("Anna");
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
