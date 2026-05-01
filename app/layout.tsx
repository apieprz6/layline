import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Layline — Sailing Race Dashboard",
  description: "Wednesday night race preparation dashboard for competitive sailors at Navy Pier, Lake Michigan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
