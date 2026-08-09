import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Satoshi is the primary editorial grotesk for display, headings, body and UI.
const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  src: [
    { path: "../../satoshi/Satoshi-Regular.otf", weight: "400", style: "normal" },
    { path: "../../satoshi/Satoshi-Italic.otf", weight: "400", style: "italic" },
    { path: "../../satoshi/Satoshi-Medium.otf", weight: "500", style: "normal" },
    { path: "../../satoshi/Satoshi-MediumItalic.otf", weight: "500", style: "italic" },
    { path: "../../satoshi/Satoshi-Bold.otf", weight: "700", style: "normal" },
    { path: "../../satoshi/Satoshi-BoldItalic.otf", weight: "700", style: "italic" },
    { path: "../../satoshi/Satoshi-Black.otf", weight: "900", style: "normal" },
    { path: "../../satoshi/Satoshi-BlackItalic.otf", weight: "900", style: "italic" },
  ],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "GuruDroneAI",
  description:
    "AI co-teacher that creates, simulates, teaches, and adapts multilingual classroom lessons.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
