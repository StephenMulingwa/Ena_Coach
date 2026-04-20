import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ena Fleet Insights",
  description: "Fleet management and driver evaluation dashboard",
  icons: {
    icon: [
      { url: "/favicon.ico?v=4", type: "image/x-icon", sizes: "any" },
      { url: "/enalogo.png?v=2", type: "image/png", sizes: "32x32" },
      { url: "/enalogo.png?v=2", type: "image/png", sizes: "192x192" },
      { url: "/enalogo.png?v=2", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/favicon.ico?v=4", type: "image/x-icon" }],
    apple: [{ url: "/enalogo.png?v=2", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
