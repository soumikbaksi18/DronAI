import type { Metadata } from "next";
import { PitchDeck } from "@/components/pitch/PitchDeck";

export const metadata: Metadata = {
  title: "Pitch · GuruDroneAI",
  description:
    "Product pitch slides — GuruDroneAI features from ingest to live AI co-teaching.",
};

export default function SlidePage() {
  return <PitchDeck />;
}
