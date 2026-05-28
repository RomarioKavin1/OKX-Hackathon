import type { Metadata } from "next";
import { Anton, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Display — condensed poster face (headlines, big numbers, card names). Not variable.
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

// Body / UI — warm grotesque, variable.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

// Mono — addresses, tx hashes, verifiable data.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PANENKA — Daily fantasy World Cup, on-chain",
    template: "%s · PANENKA",
  },
  description:
    "Own your XI. Daily fantasy football for the 2026 World Cup on OKX X Layer. Collect player cards, rent stars by the matchday, score on real match data, win USDC.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${hanken.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}