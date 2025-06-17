import './globals.css'
import { AuthProvider } from "@/app/components/AuthContext";
import AuthenticatedApp from "@/app/components/AuthenticatedApp";

export const metadata = {
  title: 'Switch',
  description: 'Your best accounting software',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AuthenticatedApp>{children}</AuthenticatedApp>
        </AuthProvider>
      </body>
    </html>
  )
}
