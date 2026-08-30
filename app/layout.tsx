import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Vectorizer Dashboard",
  description: "Visualize your semantic memory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
