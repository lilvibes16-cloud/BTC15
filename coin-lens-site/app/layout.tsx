import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Coin Lens · Research before risk',description:'Read-only Solana discovery. Real market snapshots, visible gaps, no automatic trades.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
