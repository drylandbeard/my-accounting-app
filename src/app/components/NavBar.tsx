'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function NavLink({ href, label }: { href: string, label: string }) {
  const pathname = usePathname()
  const isActive = pathname === href

  return (
    <Link
      href={href}
      className={`px-2 py-1 rounded ${
        isActive ? 'font-semibold text-black' : 'text-gray-700 hover:text-black'
      }`}
    >
      {label}
    </Link>
  )
}

export default function NavBar() {
  return (
    <nav className="flex justify-between items-center px-6 py-2 bg-gray-100 border-b border-gray-300 text-sm font-medium">

      <div className="space-x-6 flex">
        <NavLink href="/categorize-plaid" label="Transactions" />
        <NavLink href="/chart-of-accounts" label="Categories" />
        <NavLink href="/reports/pnl" label="Profit & Loss" />
        <NavLink href="/reports/balance-sheet" label="Balance Sheet" />
      </div>

      <div className="space-x-4 text-gray-500">
        {/* Future: Settings | Profile */}
      </div>

    </nav>
  )
}
