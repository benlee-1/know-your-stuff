import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Know Your Stuff",
  description: "Interview prep for the things you've built.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
