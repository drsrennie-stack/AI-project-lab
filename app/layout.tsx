import type { Metadata } from "next";
import "./globals.css";
import { HeightSender } from "@/components/ui/HeightSender";

export const metadata: Metadata = {
  title: "AI Project Lab",
  description: "A collaborative workspace for team AI projects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body style={{ ["--font-body" as string]: "'Plus Jakarta Sans'", ["--font-display" as string]: "'Open Sans'" }}>
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
        <HeightSender />
      </body>
    </html>
  );
}
