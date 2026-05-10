import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b2f85",
};

export const metadata: Metadata = {
  title: "Ena Fleet Insights",
  description: "Fleet management and driver evaluation dashboard",
  icons: {
    icon: [
      { url: "/favicon.ico?v=5", type: "image/x-icon", sizes: "any" },
      { url: "/enalogo.png?v=3", type: "image/png", sizes: "32x32" },
      { url: "/enalogo.png?v=3", type: "image/png", sizes: "192x192" },
      { url: "/enalogo.png?v=3", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/favicon.ico?v=5", type: "image/x-icon" }],
    apple: [{ url: "/enalogo.png?v=3", type: "image/png" }],
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
