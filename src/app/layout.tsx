import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VYAVASTHA",
  description: "Personal Multimodal Knowledge & Memory Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas text-text-primary antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
