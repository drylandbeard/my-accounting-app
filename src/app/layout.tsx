import './globals.css'
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/components/AuthProvider";
import AuthenticatedApp from "@/components/AuthenticatedApp";

export const metadata = {
  title: 'switch',
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
        <Toaster />
      </body>
    </html>
  )
}
