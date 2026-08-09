export type PitchSlide = {
  id: string;
  kicker?: string;
  title: string;
  body: string;
  points?: string[];
  footer?: string;
  accent?: "brand" | "problem" | "feature" | "close";
};

/** Product pitch deck — one idea per slide. */
export const PITCH_SLIDES: PitchSlide[] = [
  {
    id: "open",
    kicker: "GuruDroneAI",
    title: "The AI classroom operating system",
    body: "An AI co-teacher that turns lesson material into a live, multilingual, interactive classroom — then simulates it with student personas before you teach.",
    footer: "Create → Simulate → Critique → Refine → Teach → Adapt",
    accent: "brand",
  },
  {
    id: "problem",
    kicker: "The problem",
    title: "Teachers still build the whole class by hand",
    body: "Notes become slides, slides need visuals, visuals need narration, narration needs quizzes — and nobody knows if students will follow until the room goes quiet.",
    points: [
      "Hours spent structuring and designing",
      "Tools stop at “generate a deck”",
      "No rehearsal of how the lesson lands",
    ],
    accent: "problem",
  },
  {
    id: "gap",
    kicker: "The missing layer",
    title: "How will this lesson perform with real students?",
    body: "Existing AI tools create content. GuruDroneAI creates, tests, conducts, and adapts the classroom experience itself.",
    accent: "brand",
  },
  {
    id: "loop",
    kicker: "Core loop",
    title: "From upload to adaptive teaching",
    body: "One continuous loop — not a pile of disconnected tools.",
    points: ["Create", "Simulate", "Critique", "Refine", "Teach", "Adapt"],
    accent: "feature",
  },
  {
    id: "upload",
    kicker: "Feature · Ingest",
    title: "Upload any lesson source",
    body: "PDFs, Markdown, notes, docs — extracted and split into clean chapter parts ready for the Classroom Director.",
    points: ["Document AI + local PDF extract", "Structured MD parts", "Teacher-chosen scene count"],
    accent: "feature",
  },
  {
    id: "scenes",
    kicker: "Feature · Scenes",
    title: "Plan the classroom as scenes",
    body: "The chapter becomes a sequence of teachable moments — each with narration, slide intent, visuals, and questions.",
    points: ["~80% presentation · ~20% video tags", "Approve before generating media", "Director-ready scene pack"],
    accent: "feature",
  },
  {
    id: "presentations",
    kicker: "Feature · Presentations",
    title: "Beautiful pages with paragraphs & images",
    body: "Presentation-tagged scenes become polished pages — elegant copy plus OpenAI illustrations for classroom screens.",
    points: ["Paragraph generation", "Educational image prompts", "Ready for the live deck"],
    accent: "feature",
  },
  {
    id: "personas",
    kicker: "Feature · Simulate",
    title: "AI student personas attend first",
    body: "Before class, a crew of personas walks the lesson — fast learners, struggling students, shy voices — and surfaces where it will break.",
    points: ["Classroom-readiness report", "Confusing or boring beats", "Refine before you teach"],
    accent: "feature",
  },
  {
    id: "coteacher",
    kicker: "Feature · Live",
    title: "Voice-controlled AI co-teacher",
    body: "In class, Guru listens. Explain again, switch language, skip ahead, ask the room a question — natural commands, not another toolbar.",
    points: ['“Explain this in Hindi.”', "Simplify · examples · quizzes", "Navigate scenes live"],
    accent: "feature",
  },
  {
    id: "multi",
    kicker: "Feature · Language",
    title: "Built for multilingual India",
    body: "Classrooms where English is not the only voice. Keep science terms; change the explanation language on command.",
    points: ["Voice as the control layer", "Per-concept language switches", "Inclusive by design"],
    accent: "feature",
  },
  {
    id: "close",
    kicker: "GuruDroneAI",
    title: "Not another slide generator",
    body: "An AI classroom that can create, simulate, teach, and adapt — so teachers spend less time building the lesson and more time teaching it.",
    footer: "Open Studio · Start with a chapter",
    accent: "close",
  },
];
