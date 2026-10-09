import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui";

const geist = Geist({ subsets: ["latin"] });

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
    <html lang="pt-PT" className={geist.className}>
      <body className="min-h-dvh bg-neutral-50 antialiased">
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
