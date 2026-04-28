import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import EdgeStoreProviderWrapper from "./components/EdgeStoreProviderWrapper";

// Clean UI text font
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Massive elegant header font (matching your reference image)
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Zeus – Aircraft Lessee System",
  description: "Aircraft lessee data verification and management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased selection:bg-accent selection:text-foreground`}
      suppressHydrationWarning
    >
      {/* Apply dark class before first paint to eliminate flash */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('zeus-dark-mode')!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}})()` }} />
      </head>
      <body className="relative min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden font-sans">
        
        {/* --- Minimal Editorial Canvas --- */}
        <div className="fixed inset-0 z-0 pointer-events-none bg-[var(--background)]">
           {/* Pure, clean canvas */}
        </div>

        {/* --- Main Content Container --- */}
        <div className="relative z-10 flex flex-col min-h-full">
          <EdgeStoreProviderWrapper>{children}</EdgeStoreProviderWrapper>
        </div>
        
      </body>
    </html>
  );
}