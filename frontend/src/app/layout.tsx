import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finance AI — Gestão financeira para PME",
  description: "Fluxo de caixa, faturas, IVA e reconciliação bancária para PME portuguesas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" className={inter.className}>
      <body className="min-h-screen bg-[#F8FAFC] antialiased">
        <AppProvider>
          <ConfirmProvider>
            {children}
            <Toaster richColors position="top-right" />
          </ConfirmProvider>
        </AppProvider>
      </body>
    </html>
  );
}
