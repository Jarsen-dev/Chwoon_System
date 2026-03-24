import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema de Producción",
  description: "Control de planta y generación de etiquetas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        {/* Menú principal - reemplaza PartApp.__init__ */}
        <nav className="bg-slate-800 text-white p-4">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/Logo.png" alt="Logo" className="h-8 w-auto" />
              <h1 className="text-xl font-bold">Sistema de Producción</h1>
            </div>
            <div className="flex gap-4">
              <a href="/" className="hover:text-blue-300 transition">Dashboard</a>
              <a href="/partes" className="hover:text-blue-300 transition">⚙️ Partes</a>
              <a href="/etiquetas" className="hover:text-blue-300 transition">🖨️ Etiquetas</a>
              <a href="/produccion" className="hover:text-blue-300 transition">🔍 Producción</a>
            </div>
          </div>
        </nav>
        
        <main className="container mx-auto p-4">
          {children}
        </main>
      </body>
    </html>
  );
}