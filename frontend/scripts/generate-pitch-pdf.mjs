/**
 * One-shot generator: writes public/GuruDroneAI-Pitch.pdf from pitch slide copy.
 * Run: node scripts/generate-pitch-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "GuruDroneAI-Pitch.pdf");

const SLIDES = [
  {
    kicker: "GuruDroneAI",
    title: "The AI classroom operating system",
    body: "An AI co-teacher that turns lesson material into a live, multilingual, interactive classroom — then simulates it with student personas before you teach.",
    footer: "Create → Simulate → Critique → Refine → Teach → Adapt",
  },
  {
    kicker: "The problem",
    title: "Teachers still build the whole class by hand",
    body: "Notes become slides, slides need visuals, visuals need narration, narration needs quizzes — and nobody knows if students will follow until the room goes quiet.",
    points: [
      "Hours spent structuring and designing",
      "Tools stop at “generate a deck”",
      "No rehearsal of how the lesson lands",
    ],
  },
  {
    kicker: "The missing layer",
    title: "How will this lesson perform with real students?",
    body: "Existing AI tools create content. GuruDroneAI creates, tests, conducts, and adapts the classroom experience itself.",
  },
  {
    kicker: "Core loop",
    title: "From upload to adaptive teaching",
    body: "One continuous loop — not a pile of disconnected tools.",
    points: ["Create", "Simulate", "Critique", "Refine", "Teach", "Adapt"],
  },
  {
    kicker: "Feature · Ingest",
    title: "Upload any lesson source",
    body: "PDFs, Markdown, notes, docs — extracted and split into clean chapter parts ready for the Classroom Director.",
    points: ["Document AI + local PDF extract", "Structured MD parts", "Teacher-chosen scene count"],
  },
  {
    kicker: "Feature · Scenes",
    title: "Plan the classroom as scenes",
    body: "The chapter becomes a sequence of teachable moments — each with narration, slide intent, visuals, and questions.",
    points: ["~80% presentation · ~20% video tags", "Approve before generating media", "Director-ready scene pack"],
  },
  {
    kicker: "Feature · Presentations",
    title: "Beautiful pages with paragraphs & images",
    body: "Presentation-tagged scenes become polished pages — elegant copy plus OpenAI illustrations for classroom screens.",
    points: ["Paragraph generation", "Educational image prompts", "Ready for the live deck"],
  },
  {
    kicker: "Feature · Simulate",
    title: "AI student personas attend first",
    body: "Before class, a crew of personas walks the lesson — fast learners, struggling students, shy voices — and surfaces where it will break.",
    points: ["Classroom-readiness report", "Confusing or boring beats", "Refine before you teach"],
  },
  {
    kicker: "Feature · Live",
    title: "Voice-controlled AI co-teacher",
    body: "In class, Guru listens. Explain again, switch language, skip ahead, ask the room a question — natural commands, not another toolbar.",
    points: ['“Explain this in Hindi.”', "Simplify · examples · quizzes", "Navigate scenes live"],
  },
  {
    kicker: "Feature · Language",
    title: "Built for multilingual India",
    body: "Classrooms where English is not the only voice. Keep science terms; change the explanation language on command.",
    points: ["Voice as the control layer", "Per-concept language switches", "Inclusive by design"],
  },
  {
    kicker: "GuruDroneAI",
    title: "Not another slide generator",
    body: "An AI classroom that can create, simulate, teach, and adapt — so teachers spend less time building the lesson and more time teaching it.",
    footer: "Open Studio · Start with a chapter",
  },
];

const ACCENT = "#0c5c4d";
const INK = "#13201b";
const MUTED = "#5a6b63";
const PAGE_W = 842; // A4 landscape
const PAGE_H = 595;
const MARGIN = 56;

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const doc = new PDFDocument({
  size: [PAGE_W, PAGE_H],
  margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  info: {
    Title: "GuruDroneAI — Product Pitch",
    Author: "GuruDroneAI",
    Subject: "Product pitch slides",
  },
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

function drawBackdrop() {
  doc.save();
  doc.rect(0, 0, PAGE_W, PAGE_H).fill("#e8efe9");
  doc.circle(80, 40, 180).fillOpacity(0.18).fill(ACCENT);
  doc.fillOpacity(1);
  doc.circle(PAGE_W - 40, PAGE_H - 20, 160).fillOpacity(0.1).fill("#a08246");
  doc.fillOpacity(1);
  doc.restore();
}

function drawChrome(index, total) {
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(ACCENT)
    .text("GuruDroneAI", MARGIN, 28, { continued: false });

  const label = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text(label, 0, 32, { width: PAGE_W - MARGIN, align: "right" });
}

SLIDES.forEach((slide, index) => {
  if (index > 0) doc.addPage({ size: [PAGE_W, PAGE_H], margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
  drawBackdrop();
  drawChrome(index, SLIDES.length);

  let y = 100;

  if (slide.kicker) {
    const isBrand = slide.kicker === "GuruDroneAI";
    doc
      .font(isBrand ? "Helvetica-Bold" : "Helvetica")
      .fontSize(isBrand ? 22 : 11)
      .fillColor(ACCENT)
      .text(isBrand ? slide.kicker : slide.kicker.toUpperCase(), MARGIN, y, {
        width: PAGE_W - MARGIN * 2,
        characterSpacing: isBrand ? 0 : 1.2,
      });
    y = doc.y + (isBrand ? 18 : 22);
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(32)
    .fillColor(INK)
    .text(slide.title, MARGIN, y, {
      width: PAGE_W - MARGIN * 2 - 80,
      lineGap: 4,
    });
  y = doc.y + 18;

  doc
    .font("Helvetica")
    .fontSize(14)
    .fillColor(MUTED)
    .text(slide.body, MARGIN, y, {
      width: PAGE_W - MARGIN * 2 - 40,
      lineGap: 5,
    });
  y = doc.y + 22;

  if (slide.points?.length) {
    for (const point of slide.points) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor(ACCENT)
        .text(`•  ${point}`, MARGIN, y, { width: PAGE_W - MARGIN * 2 });
      y = doc.y + 8;
    }
  }

  if (slide.footer) {
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(ACCENT)
      .text(slide.footer, MARGIN, PAGE_H - 64, {
        width: PAGE_W - MARGIN * 2,
      });
  }
});

doc.end();

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});

console.log(`Wrote ${outPath}`);
