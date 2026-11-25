import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Açaí Carioca Studio",
  description: "A visual content studio for Açaí Carioca."
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}