import { numberParticipants } from "./warnemuende-domain.js";

// Masse des Originals aus output/pdf/warnemuende_teilnehmerliste.pdf (A4 quer, ReportLab):
// zwei Tabellenbloecke nebeneinander, je 26 Datenzeilen unter einer Kopfzeile.
const PAGE = { width: 841.8898, height: 595.2756 };
const TITLE = { x: 40.01575, y: 535.2598, size: 20 };
const TABLE = { x: 40.01575, y: 60.70866, blockOffset: 396.8504, width: 377.0079, rowHeight: 17.00787, rows: 26 };
const COLUMNS = [
  { key: "nr", label: "Nr.", x: 0, width: 25.51181, align: "center" },
  { key: "name", label: "Name", x: 25.51181, width: 76.53543 },
  { key: "vorname", label: "Vorname", x: 102.0472, width: 73.70079 },
  { key: "essensauswahl", label: "Essensauswahl", x: 175.748, width: 68.03150 },
  { key: "bezahlt", label: "Bezahlt", x: 243.7795, width: 51.02362 },
  { key: "bemerkung", label: "Bemerkungen", x: 294.8031, width: 82.20472 }
];
const PADDING = 3.68;
const COLORS = {
  title: ".090196 .243137 .294118",
  header: ".121569 .352941 .423529",
  zebra: ".945098 .964706 .972549",
  text: ".141176 .203922 .227451",
  grid: ".784314 .843137 .866667"
};
const FONT_SIZE = { header: 7.2, row: 7.4, footer: 7.4 };

/** Helvetica ist metrisch bekannt genug: 0.5 em je Zeichen traegt fuer das Kuerzen. */
const textWidth = (value, size) => value.length * size * 0.5;

const truncate = (value, size, maxWidth) => {
  const text = String(value ?? "");
  if (textWidth(text, size) <= maxWidth) return text;
  const fits = Math.max(0, Math.floor(maxWidth / (size * 0.5)) - 1);
  return `${text.slice(0, fits).trimEnd()}.`;
};

/** WinAnsi entspricht fuer deutsche Texte Latin-1; Sonderzeichen werden oktal geschrieben. */
const pdfText = value => [...String(value ?? "")]
  .map(char => {
    const code = char.charCodeAt(0);
    if (char === "(" || char === ")" || char === "\\") return `\\${char}`;
    if (code < 32 || code > 255) return code > 255 ? "?" : " ";
    return code > 126 ? `\\${code.toString(8).padStart(3, "0")}` : char;
  })
  .join("");

const show = (x, y, value, { font = "F1", size = FONT_SIZE.row } = {}) =>
  `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(4)} ${y.toFixed(4)} Tm (${pdfText(value)}) Tj ET`;

const rect = (x, y, width, height, color) =>
  `${color} rg\nn ${x.toFixed(4)} ${y.toFixed(4)} ${width.toFixed(4)} ${height.toFixed(4)} re f*`;

const line = (x1, y1, x2, y2, color, lineWidth = 0.5) =>
  `${color} RG\n${lineWidth} w\nn ${x1.toFixed(4)} ${y1.toFixed(4)} m ${x2.toFixed(4)} ${y2.toFixed(4)} l S`;

const cellValue = (participant, column) => {
  if (column.key === "nr") return participant.nr ?? "";
  if (column.key === "bezahlt") return participant.bezahlt ? "ja" : "";
  return participant[column.key] ?? "";
};

const drawBlock = (rows, blockX) => {
  const top = TABLE.rowHeight * (TABLE.rows + 1);
  const parts = [rect(blockX, top - TABLE.rowHeight, TABLE.width, TABLE.rowHeight, COLORS.header)];

  rows.forEach((participant, index) => {
    if (index % 2 === 1) return;
    parts.push(rect(blockX, top - TABLE.rowHeight * (index + 2), TABLE.width, TABLE.rowHeight, COLORS.zebra));
  });

  parts.push("1 1 1 rg");
  COLUMNS.forEach(column => {
    const x = blockX + column.x + (column.align === "center"
      ? (column.width - textWidth(column.label, FONT_SIZE.header)) / 2
      : PADDING);
    parts.push(show(x, top - TABLE.rowHeight + 7.3, column.label, { font: "F2", size: FONT_SIZE.header }));
  });

  parts.push(`${COLORS.text} rg`);
  rows.forEach((participant, index) => {
    const baseline = top - TABLE.rowHeight * (index + 2) + 7.3;
    COLUMNS.forEach(column => {
      const value = truncate(cellValue(participant, column), FONT_SIZE.row, column.width - 2 * PADDING);
      if (value === "") return;
      const x = blockX + column.x + (column.align === "center"
        ? (column.width - textWidth(value, FONT_SIZE.row)) / 2
        : PADDING);
      parts.push(show(x, baseline, value, { size: FONT_SIZE.row }));
    });
    // Abgesagte werden wie am Bildschirm durchgestrichen statt weggelassen.
    if (participant.abgesagt) {
      const middle = top - TABLE.rowHeight * (index + 2) + TABLE.rowHeight / 2;
      parts.push(line(blockX + PADDING, middle, blockX + TABLE.width - PADDING, middle, COLORS.text, 0.4));
    }
  });

  for (let row = 0; row <= rows.length + 1; row++) {
    const y = top - TABLE.rowHeight * row;
    parts.push(line(blockX, y, blockX + TABLE.width, y, COLORS.grid));
  }
  const bottom = top - TABLE.rowHeight * (rows.length + 1);
  [...COLUMNS.slice(1).map(column => column.x), TABLE.width].forEach(x => {
    parts.push(line(blockX + x, bottom, blockX + x, top, COLORS.grid));
  });
  parts.push(line(blockX, top - TABLE.rowHeight, blockX + TABLE.width, top - TABLE.rowHeight, COLORS.header, 1));

  return parts.join("\n");
};

const drawPage = (rows, { title, footer }) => {
  const [left, right] = [rows.slice(0, TABLE.rows), rows.slice(TABLE.rows)];
  return [
    `${COLORS.title} rg`,
    show(TITLE.x, TITLE.y, title, { font: "F2", size: TITLE.size }),
    `q 1 0 0 1 ${TABLE.x.toFixed(4)} ${TABLE.y.toFixed(4)} cm`,
    drawBlock(left, 0),
    ...(right.length ? [drawBlock(right, TABLE.blockOffset)] : []),
    "Q",
    `${COLORS.text} rg`,
    show(TITLE.x, TABLE.y - 22, footer, { size: FONT_SIZE.footer })
  ].join("\n");
};

const buildDocument = pages => {
  const objects = [];
  const pageIds = pages.map((unused, index) => 4 + index * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> "
    + "/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >> >>");
  pages.forEach((content, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources 3 0 R /Contents ${pageIds[index] + 1} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(offset => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
};

export const buildWarnemuendePdf = (participants, { title = "Teilnehmerliste Warnemünde", date = new Date() } = {}) => {
  const rows = numberParticipants(participants);
  const perPage = TABLE.rows * 2;
  const mitfahrend = rows.filter(participant => !participant.abgesagt);
  const meals = ["Zander", "Rind", "Vegie"]
    .map(option => `${option}: ${mitfahrend.filter(participant => participant.essensauswahl === option).length}`)
    .join("   ");
  const footer = `${mitfahrend.length} Teilnehmer   ${meals}   bezahlt: ${mitfahrend.filter(participant => participant.bezahlt).length}`
    + `   Stand: ${date.toLocaleDateString("de-DE")}`;

  const pages = [];
  for (let start = 0; start < Math.max(rows.length, 1); start += perPage) {
    pages.push(drawPage(rows.slice(start, start + perPage), { title, footer }));
  }
  return buildDocument(pages);
};

/** PDF-Text ist WinAnsi, also Byte-fuer-Byte Latin-1 - kein UTF-8. */
export const pdfToBytes = pdf => Uint8Array.from([...pdf].map(char => char.charCodeAt(0) & 255));
