import './globals.css'
import { AuthProvider } from "@/components/AuthContext";
import AuthenticatedApp from "@/components/AuthenticatedApp";

export const metadata = {
  title: 'Switch',
  description: 'Your comprehensive accounting solution for managing transactions, automations, and financial reporting.',
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
