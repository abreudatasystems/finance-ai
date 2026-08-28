import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finance AI — Your AI Finance Team for Business",
  description: "Plataforma financeira SaaS AI-native para PMEs. Gestão de fluxo de caixa, automação documental e inteligência financeira.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt" className={inter.className}>
      <body className="min-h-screen bg-[#F8FAFC] antialiased">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
