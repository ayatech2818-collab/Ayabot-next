import type { Metadata, Viewport } from "next";
import { Inter, Space_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "../constants/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ayadi Glocal School - Voice Assistant",
  description: "The Future of Learning. Interactive Voice Assistant for Ayadi Glocal School.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050b18" },
    { media: "(prefers-color-scheme: light)", color: "#f3f7fb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-scene="on"
      className={`${inter.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets the saved or system theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
