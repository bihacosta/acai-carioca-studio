import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Content Atelier",
  description: "Content planning for brands: feed, stories, email and approvals in one place.",
  appleWebApp: { capable: true, title: "Atelier", statusBarStyle: "default" }
};
export const viewport: Viewport = {
  themeColor: "#fbf4ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}