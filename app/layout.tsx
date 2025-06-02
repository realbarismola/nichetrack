import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/layout/Sidebar";
import { UserProvider } from "@/app/context/UserProvider";
import UserMenu from "@/components/UserMenu";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "NicheTrack - Track Reddit Trends",
  description: "Discover emerging micro-niches before they go mainstream",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${roboto.variable} ${robotoMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UserProvider>
            <div className="flex h-screen">
              <Sidebar />
              <main className="flex-1 overflow-auto">
                <div className="relative">
                  <UserMenu />
                  {children}
                </div>
              </main>
            </div>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}