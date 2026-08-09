import { assetUrl, type Lesson, type PresentationPage } from "./api";

const DECKS_KEY = "gurudrone.studio-decks";
const ACTIVE_KEY = "gurudrone.studio-deck-active";

export type StitchedDeck = Lesson & {
  /** Absolute image URLs so the deck survives a page reload. */
  presentation_pages: PresentationPage[];
  presentations_approved: boolean;
  approvedAt: string;
};

function readAll(): StitchedDeck[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StitchedDeck[];
  } catch {
    return [];
  }
}

function writeAll(decks: StitchedDeck[]): void {
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

/** Resolve relative /uploads paths before we park the deck in localStorage. */
function withAbsoluteImages(lesson: Lesson): PresentationPage[] {
  return (lesson.presentation_pages ?? []).map((page) => ({
    ...page,
    image_url: assetUrl(page.image_url) ?? page.image_url ?? null,
  }));
}

/**
 * Persist the stitched presentation (paragraphs + OpenAI images + video slots)
 * so Studio can reopen it without another generate call.
 */
export function approveStitchedDeck(lesson: Lesson): StitchedDeck {
  if (!lesson.presentation_pages?.length) {
    throw new Error("Generate presentation pages before approving.");
  }

  const deck: StitchedDeck = {
    ...lesson,
    presentation_pages: withAbsoluteImages(lesson),
    presentations_approved: true,
    approvedAt: new Date().toISOString(),
  };

  const all = readAll().filter((item) => item.id !== deck.id);
  all.unshift(deck);
  writeAll(all);
  localStorage.setItem(ACTIVE_KEY, deck.id);
  return deck;
}

export function getStitchedDeck(id: string): StitchedDeck | null {
  return readAll().find((deck) => deck.id === id) ?? null;
}

export function getActiveStitchedDeck(): StitchedDeck | null {
  if (typeof window === "undefined") return null;
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (!activeId) return null;
  return getStitchedDeck(activeId);
}

export function listStitchedDecks(): StitchedDeck[] {
  return readAll().sort(
    (a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime(),
  );
}

export function setActiveStitchedDeck(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}
