import type { Metadata, Viewport } from "next";
import "./globals.css";
import "mana-font/css/mana.css";
import { AuthProvider } from "@/components/AuthProvider";
import NavAuth from "@/components/NavAuth";

export const metadata: Metadata = {
  title: "MTG Deck Optimizer",
  description: "Commander deck builder and optimizer powered by Scryfall + EDHREC",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MTG Optimizer",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030712",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <header className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 text-yellow-400 font-bold text-lg tracking-wide">
              <span className="text-2xl">⚔️</span>
              <span>MTG Optimizer</span>
            </a>
            <span className="text-gray-500 text-sm">Commander / EDH</span>
            <div className="ml-auto flex items-center gap-4">
              <div className="hidden md:flex items-center gap-3 text-gray-500 text-xs">
                <span>Powered by</span>
                <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Scryfall</a>
                <span>+</span>
                <a href="https://edhrec.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">EDHREC</a>
              </div>
              <NavAuth />
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
