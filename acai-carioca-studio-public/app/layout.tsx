import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Açaí Carioca Studio",
  description: "A visual content studio for Açaí Carioca.",
  appleWebApp: { capable: true, title: "Studio", statusBarStyle: "default" }
};
export const viewport: Viewport = {
  themeColor: "#f5f1eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}