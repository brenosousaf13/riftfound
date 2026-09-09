import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RIFTFOUND — Troque o que você joga",
  description: "Marketplace comunitário para comprar, vender e trocar cartas de Riftbound.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
