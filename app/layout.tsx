import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import "./globals.css"

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Roadrash — The game that started everything",
  description: "A playable browser tribute by Sandesh Chapagain to Road Rash—the first game he played and the experience that sparked his fascination with computers.",
  authors: [{name: "Sandesh Chapagain", url: "https://github.com/Dexasan"}],
  creator: "Sandesh Chapagain",
  openGraph: {
    title: "Roadrash — The game that started everything",
    description: "A playable tribute to the first game that made me curious about computers.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roadrash — The game that started everything",
    description: "A playable browser tribute to the game that sparked my fascination with computers.",
    images: ["/og.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#0b0a09",
  colorScheme: "dark",
}

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}{process.env.NODE_ENV==="production"&&<Analytics/>}</body></html>
}
