import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "./components/top-nav";

export const metadata: Metadata = {
  title: "Global REACH Publications App",
  description:
    "Identify publications authored by network members that include international co-authors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
