import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

const siteUrl = "https://find-your-pi.vercel.app";
const title = "Pi Hunter | Find your place in Pi";
const description = "Search five million public Pi digits locally, construct a Merkle proof in your browser, and claim the exact occurrence on Arc Mainnet.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Pi Hunter",
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/brand/pi-hunter-icon.png", type: "image/png", sizes: "1254x1254" }],
    apple: [{ url: "/brand/pi-hunter-icon.png", type: "image/png", sizes: "1254x1254" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Pi Hunter",
    title,
    description,
    images: [{ url: "/brand/pi-hunter-banner.png", width: 1733, height: 907, alt: "A luminous Pi Hunter discovery field on Arc Mainnet" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/brand/pi-hunter-banner.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
