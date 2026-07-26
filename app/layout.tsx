import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import "./globals.css"

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Roadrash — Browser Motorcycle Combat",
  description: "Race, fight, and weave through traffic in an original browser arcade tribute built with Canvas 2D.",
  authors: [{ name: "Sandesh Chapagain", url: "https://github.com/Dexasan" }],
  creator: "Sandesh Chapagain",
  openGraph: {
    title: "Roadrash — Browser Motorcycle Combat",
    description: "Five riders. One finish line. No clean racing.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roadrash — Browser Motorcycle Combat",
    description: "Five riders. One finish line. No clean racing.",
    images: ["/og.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#080b0f",
  colorScheme: "dark",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}{process.env.NODE_ENV === "production" && <Analytics />}</body></html>
}
