import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agüita Surf — La Cícer Beach Conditions & Surf Alerts",
  description:
    "Live tide, wind and wave conditions for La Cícer beach, Las Palmas de Gran Canaria. Get a push notification when it's a good time to surf.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Agüita Surf" },
};

export const viewport: Viewport = {
  themeColor: "#061826",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://marine-api.open-meteo.com" />
        <link rel="preconnect" href="https://api.open-meteo.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
