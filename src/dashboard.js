import Chart from "chart.js/auto";
import { germanCollator, interestGroupMap } from "./member-config.js";
import {
  formatMemberName,
  getEntriesPerYear,
  getExitsPerYear,
  getNewestMembers,
  getRoundBirthdays,
  getUpcomingBirthday,
  isActiveMember,
  isComputerGroupMember,
  isGuestMember,
  isOpenClubPaymentMember
} from "./member-domain.js";
import {
  asBoolean,
  calculateAge,
  formatCurrency,
  formatDateDE,
  formatIsoDate,
  getBusinessYearRange,
  percent,
  sumPaymentsInBusinessYear
} from "./member-utils.js";
import { state } from "./state.js";
import { setText } from "./ui.js";

export const createDashboard = ({
  openMemberModal,
  resolveMemberPhotoDataUrl,
  setFallbackPhoto,
  showOverviewForAgeBucket,
  showOverviewForEntryYear,
  showOverviewForInterestGroup,
  showHistoricalForExitYear
}) => {
  const charts = new Map();

  const createMemberPhoto = (member, className) => {
    const photo = document.createElement("div");
    photo.className = `${className} member-photo member-photo--fallback`;
    setFallbackPhoto(photo);
    photo.classList.add(className);
    resolveMemberPhotoDataUrl(member).then(photoDataUrl => {
      if (!photoDataUrl) return;
      const image = document.createElement("img");
      image.className = "member-photo__image";
      image.alt = `Passfoto von ${formatMemberName(member)}`;
      image.addEventListener("error", () => {
        setFallbackPhoto(photo);
        photo.classList.add(className);
      }, { once: true });
      photo.className = `${className} member-photo`;
      photo.title = image.alt;
      photo.setAttribute("aria-label", image.alt);
      photo.replaceChildren(image);
      image.src = photoDataUrl;
    }).catch(() => {});
    return photo;
  };

  const renderAgeChart = (buckets, total) => {
    const canvas = document.getElementById("ageChart");
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
    charts.get("ageChart")?.destroy();
    const labels = buckets.map(bucket => bucket.label);
    const data = buckets.map(bucket => bucket.count);
    const colors = buckets.map((_, index) => index % 2 === 0 ? "rgba(15, 118, 110, 0.85)" : "rgba(44, 160, 151, 0.85)");
    charts.set("ageChart", new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: "Mitglieder", data, backgroundColor: colors, borderColor: colors.map(color => color.replace(/0\.85\)$/, "1)")), borderWidth: 1, borderRadius: 12, borderSkipped: false, maxBarThickness: 36 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        onClick: (_event, elements) => {
          const index = elements?.[0]?.index;
          if (Number.isInteger(index)) showOverviewForAgeBucket(buckets[index]);
        },
        onHover: (event, elements) => {
          if (event?.native?.target) event.native.target.style.cursor = elements?.length ? "pointer" : "default";
        },
        layout: { padding: { top: 10, right: 6, bottom: 4, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => `${context.parsed.y} Mitglieder (${percent(context.parsed.y, total)}%)` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#46535c", font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } },
          y: { beginAtZero: true, grid: { color: "rgba(15, 118, 110, 0.08)", borderDash: [3, 3] }, ticks: { color: "#46535c", precision: 0, font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } }
        }
      }
    }));
  };

  const renderInterestGroupChart = (groups, total) => {
    const canvas = document.getElementById("groupChart");
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
    const chartContainer = canvas.parentElement;
    if (chartContainer) chartContainer.style.minHeight = `${Math.min(360, Math.max(280, groups.length * 20))}px`;
    charts.get("groupChart")?.destroy();
    const labels = groups.map(item => item.label);
    const data = groups.map(item => item.count);
    const backgroundColor = labels.map((_, index) => index % 2 === 0 ? "rgba(22, 101, 84, 0.85)" : "rgba(43, 154, 124, 0.8)");
    const borderColor = backgroundColor.map(color => color.replace(/0\.8?5\)$/, "1)"));
    charts.set("groupChart", new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: "Mitglieder", data, backgroundColor, borderColor, borderWidth: 1, borderRadius: 8, borderSkipped: false, maxBarThickness: 18 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        onClick: (_event, elements) => {
          const index = elements?.[0]?.index;
          if (Number.isInteger(index)) showOverviewForInterestGroup(groups[index]);
        },
        onHover: (event, elements) => {
          if (event?.native?.target) event.native.target.style.cursor = elements?.length ? "pointer" : "default";
        },
        layout: { padding: { top: 10, right: 6, bottom: 4, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => `${context.parsed.x} Mitglieder (${percent(context.parsed.x, total)}%)` } }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: "rgba(15, 118, 110, 0.08)", borderDash: [3, 3] }, ticks: { color: "#46535c", precision: 0, font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } },
          y: { grid: { display: false }, ticks: { autoSkip: false, color: "#46535c", font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } }
        }
      }
    }));
  };

  const renderMembershipDatesPerYearChart = ({ canvasId, entries, label, onYearClick, singular, plural }) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
    charts.get(canvasId)?.destroy();
    const labels = entries.map(entry => String(entry.year));
    const data = entries.map(entry => entry.count);
    const colors = entries.map((_, index) => index % 2 === 0 ? "rgba(15, 118, 110, 0.85)" : "rgba(44, 160, 151, 0.85)");
    canvas.setAttribute("aria-label", `${label} von ${labels[0]} bis ${labels.at(-1)}`);
    charts.set(canvasId, new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label, data, backgroundColor: colors, borderColor: colors.map(color => color.replace(/0\.85\)$/, "1)")), borderWidth: 1, borderRadius: 10, borderSkipped: false, maxBarThickness: 36 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        onClick: (_event, elements) => {
          const index = elements?.[0]?.index;
          if (Number.isInteger(index)) onYearClick(entries[index].year);
        },
        onHover: (event, elements) => {
          if (event?.native?.target) event.native.target.style.cursor = elements?.length ? "pointer" : "default";
        },
        layout: { padding: { top: 10, right: 6, bottom: 4, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => `${context.parsed.y} ${context.parsed.y === 1 ? singular : plural}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#46535c", font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } },
          y: { beginAtZero: true, grid: { color: "rgba(15, 118, 110, 0.08)", borderDash: [3, 3] }, ticks: { color: "#46535c", precision: 0, font: { size: 12, family: "Segoe UI, Noto Sans, sans-serif" } } }
        }
      }
    }));
  };

  const renderBirthdayRows = (containerId, birthdays, emptyText, getBadgeText) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    if (!birthdays.length) {
      const empty = document.createElement("div");
      empty.className = "birthday-empty";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }

    birthdays.forEach(item => {
      const row = document.createElement("div");
      row.className = "birthday-row";
      row.tabIndex = 0;
      row.role = "button";
      row.title = `${formatMemberName(item.member)} öffnen`;
      const openMember = () => openMemberModal(item.member.id);
      row.addEventListener("click", openMember);
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMember();
        }
      });

      const photo = createMemberPhoto(item.member, "birthday-photo");

      const person = document.createElement("div");
      person.className = "birthday-person";
      person.textContent = `${item.member.vorname || ""} ${item.member.name || ""}`.trim();
      const details = document.createElement("div");
      details.className = "birthday-details";
      details.textContent = `${formatDateDE(item.isoDate)} · wird ${item.age}`;
      const badge = document.createElement("div");
      badge.className = "birthday-badge";
      badge.textContent = getBadgeText(item);
      const text = document.createElement("div");
      text.append(person, details);
      row.append(photo, text, badge);
      container.appendChild(row);
    });
  };

  const renderBirthdayList = (members, today) => {
    const birthdays = members
      .map(member => getUpcomingBirthday(member, today))
      .filter(Boolean)
      .sort((a, b) => a.daysUntil - b.daysUntil || String(a.member.name || "").localeCompare(String(b.member.name || ""), "de", { sensitivity: "base" }))
      .slice(0, 12);
    renderBirthdayRows("birthdayList", birthdays, "Keine Geburtstage in den nächsten 10 Tagen", item => item.daysUntil === 0 ? "Heute" : `in ${item.daysUntil} T.`);
  };

  const renderRoundBirthdayList = (members, today) => renderBirthdayRows(
    "birthdayRoundList",
    getRoundBirthdays(members, today),
    "Keine runden Geburtstage in den nächsten 6 Monaten",
    item => `${item.age}. Geburtstag`
  );

  const renderNewestMembers = members => {
    const container = document.getElementById("newestMemberList");
    if (!container) return;
    container.innerHTML = "";
    const newestMembers = getNewestMembers(members);
    if (!newestMembers.length) {
      const empty = document.createElement("div");
      empty.className = "birthday-empty";
      empty.textContent = "Keine Eintrittsdaten vorhanden";
      container.appendChild(empty);
      return;
    }
    newestMembers.forEach(member => {
      const row = document.createElement("button");
      const photo = createMemberPhoto(member, "newest-member-photo");
      const text = document.createElement("span");
      const name = document.createElement("strong");
      const details = document.createElement("span");
      const age = calculateAge(member.geburtstag);
      row.type = "button";
      row.className = "newest-member-row";
      row.title = `${formatMemberName(member)} öffnen`;
      row.addEventListener("click", () => openMemberModal(member.id));
      text.className = "newest-member-row__text";
      name.textContent = formatMemberName(member);
      details.textContent = `${age === null ? "Alter unbekannt" : `${age} Jahre`} · Eintritt ${formatDateDE(member.eintrittsdatum)}`;
      text.append(name, details);
      row.append(photo, text);
      container.appendChild(row);
    });
  };

  const refresh = () => {
    const today = new Date();
    const activeMembers = state.members.filter(isActiveMember);
    const clubMembers = activeMembers.filter(member => !isGuestMember(member));
    const formerClubMembers = state.members.filter(member => !isActiveMember(member) && !isGuestMember(member));
    const total = clubMembers.length;
    const guests = activeMembers.filter(isGuestMember).length;
    const clubPaid = clubMembers.filter(member => asBoolean(member.beitragClubBezahlt)).length;
    const openClubPayments = activeMembers.filter(isOpenClubPaymentMember);
    const computerMembers = clubMembers.filter(isComputerGroupMember);
    const computerTotal = computerMembers.length;
    const computerPaid = computerMembers.filter(member => asBoolean(member.beitragComputerBezahlt)).length;
    setText("metricTotal", String(total));
    setText("metricGuestCount", String(guests));
    setText("metricClubPaid", `${clubPaid} (${percent(clubPaid, total)}%)`);
    setText("metricComputerTotal", String(computerTotal));
    setText("metricComputerPaid", `${computerPaid} (${percent(computerPaid, computerTotal)}%)`);
    setText("metricClubOpen", `${openClubPayments.length} (${percent(openClubPayments.length, total)}%)`);
    setText("metricComputerOpen", `${computerTotal - computerPaid} (${percent(computerTotal - computerPaid, computerTotal)}%)`);
    const businessYearRange = getBusinessYearRange();
    setText("metricClubBusinessYearSum", formatCurrency(sumPaymentsInBusinessYear(clubMembers, "gezahlterBetragClub", "einzahlungClubAm", businessYearRange)));
    setText("metricComputerBusinessYearSum", formatCurrency(sumPaymentsInBusinessYear(computerMembers, "gezahlterBetragComputer", "einzahlungComputerAm", businessYearRange)));

    const genderCounts = { m: 0, w: 0, unknown: 0 };
    const ages = [];
    const ageBuckets = [
      ...Array.from({ length: 8 }, (_, index) => {
        const min = 55 + index * 5;
        return { label: `${min}-${min + 4}`, min, max: min + 4, count: 0 };
      }),
      { label: "95+", min: 95, max: Infinity, count: 0 }
    ];
    clubMembers.forEach(member => {
      const genderKey = String(member.geschlecht || "").toLowerCase();
      if (genderKey === "m" || genderKey === "w") genderCounts[genderKey] += 1;
      else genderCounts.unknown += 1;
      const age = calculateAge(member.geburtstag, today);
      if (age === null) return;
      ages.push(age);
      if (age >= 55) ageBuckets.find(bucket => age >= bucket.min && age <= bucket.max).count += 1;
    });
    const averageAge = ages.length ? Math.round((ages.reduce((sum, value) => sum + value, 0) / ages.length) * 10) / 10 : null;
    setText("metricAverageAge", averageAge === null ? "-" : `${averageAge} Jahre`);
    setText("metricMaleCount", `${genderCounts.m} (${percent(genderCounts.m, total)}%)`);
    setText("metricFemaleCount", `${genderCounts.w} (${percent(genderCounts.w, total)}%)`);
    renderAgeChart(ageBuckets, total);

    const groupCounts = Object.fromEntries(Object.keys(interestGroupMap).map(id => [id, 0]));
    clubMembers.forEach(member => (member.interessengruppen || []).forEach(groupId => {
      groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
    }));
    const groupRows = Object.keys(groupCounts)
      .map(id => ({ id: Number(id), label: interestGroupMap[id] || `Gruppe ${id}`, count: groupCounts[id] }))
      .filter(item => item.count > 0)
      .sort((a, b) => germanCollator.compare(a.label, b.label))
      .slice(0, Object.keys(interestGroupMap).length);
    renderInterestGroupChart(groupRows, total);
    renderMembershipDatesPerYearChart({
      canvasId: "entryChart",
      entries: getEntriesPerYear(clubMembers, today),
      label: "Eintritte pro Jahr",
      onYearClick: showOverviewForEntryYear,
      singular: "Eintritt",
      plural: "Eintritte"
    });
    renderMembershipDatesPerYearChart({
      canvasId: "exitChart",
      entries: getExitsPerYear(formerClubMembers, today),
      label: "Austritte pro Jahr",
      onYearClick: showHistoricalForExitYear,
      singular: "Austritt",
      plural: "Austritte"
    });
    renderBirthdayList(clubMembers, today);
    renderRoundBirthdayList(clubMembers, today);
    renderNewestMembers(clubMembers);
  };

  const downloadRoundBirthdayList = () => {
    const today = new Date();
    const birthdays = getRoundBirthdays(state.members.filter(member => isActiveMember(member) && !isGuestMember(member)), today);
    const lines = birthdays.length
      ? birthdays.map(item => {
        const member = item.member;
        const phone = [member.telefon, member.handy].filter(Boolean).join(" / ") || "-";
        const address = [member.strasse, [member.plz, member.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "-";
        return [`${formatMemberName(member)} – ${item.age}. Geburtstag am ${formatDateDE(item.isoDate)}`, `Telefon: ${phone}`, `Adresse: ${address}`].join("\n");
      })
      : ["Keine runden Geburtstage in den nächsten 6 Monaten."];
    const content = ["Anstehende runde Geburtstage", `Erstellt am ${formatDateDE(formatIsoDate(today))}`, "", ...lines].join("\n\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `runde-geburtstage-${formatIsoDate(today)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return { downloadRoundBirthdayList, refresh };
};
