import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vincere Cryptex",
    template: "%s | Vincere Cryptex",
  },
  description:
    "Premium cybersecurity training platform with guided courses, realistic labs, CTF challenges, and secure dashboards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full bg-background text-foreground">
        <AuthSessionProvider>
          <div className="site-shell relative flex min-h-screen flex-col">
            <Header />
            <main className="relative flex flex-1 flex-col">{children}</main>
            <Footer />
          </div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
