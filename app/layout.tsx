import './globals.css'
import type { Metadata } from 'next'
export const metadata:Metadata={title:'FASTLANE | Khởi nguồn tương lai di chuyển',description:'Giải pháp di chuyển xanh, thông minh và đẳng cấp.'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
