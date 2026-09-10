import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sotto — Tu correo, con menos ruido",
  description:
    "Separá las ventas no solicitadas y recuperá espacio para lo que importa.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
