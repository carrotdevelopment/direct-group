import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DG Plataforma", template: "%s · DG Plataforma" },
  description: "Operación comercial, pricing y stock de Direct Group.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
