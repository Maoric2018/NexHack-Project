import type { Metadata } from "next";
import { Rajdhani, Orbitron } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"],
  variable: "--font-rajdhani",
});

const orbitron = Orbitron({
    weight: ['400', '500', '600', '700', '800', '900'],
    subsets: ["latin"],
    variable: "--font-orbitron",
});

export const metadata: Metadata = {
  title: "Swish - AI Form Coach",
  description: "Next-gen Basketball Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${rajdhani.variable} ${orbitron.variable} antialiased bg-iron-dark text-white`}
      >
        {children}
      </body>
    </html>
  );
}
