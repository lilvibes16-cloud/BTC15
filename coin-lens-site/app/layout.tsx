import type { Metadata } from 'next';
import './globals.css';
import './terminal.css';
export const metadata: Metadata={title:'Coin Lens · Solana Research Terminal',description:'Read-only Solana discovery. Real market snapshots, visible gaps, no automatic trades.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
