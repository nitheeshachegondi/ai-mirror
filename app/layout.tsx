import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mirror — see how AI sees your product",
  description: "Know how AI sees your product. Fix it before your customers see it wrong.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
