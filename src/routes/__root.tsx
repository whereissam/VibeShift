import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { ConnectButton, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { MobileNav } from '@/components/mobile-nav'

function WalletSection() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const [balance, setBalance] = useState<string | null>(null)

  useEffect(() => {
    if (!account) {
      setBalance(null)
      return
    }
    suiClient
      .getBalance({ owner: account.address })
      .then((b) => {
        const sui = Number(b.totalBalance) / 1e9
        setBalance(sui.toFixed(2))
      })
      .catch(() => setBalance(null))
  }, [account, suiClient])

  return (
    <div className="flex items-center gap-2">
      {account && balance !== null && (
        <span className="text-sm font-medium text-foreground tabular-nums">
          {balance} SUI
        </span>
      )}
      <ConnectButton />
    </div>
  )
}

function RootLayout() {
  return (
    <>
      <nav className="bg-background border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4 md:space-x-8">
              <Link
                to="/"
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors"
              >
                VibeShift
              </Link>
              <div className="hidden sm:flex space-x-6">
                <Link
                  to="/"
                  className="text-muted-foreground hover:text-foreground [&.active]:text-primary [&.active]:font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/about"
                  className="text-muted-foreground hover:text-foreground [&.active]:text-primary [&.active]:font-medium transition-colors"
                >
                  About
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <WalletSection />
              <ThemeToggle />
              <MobileNav />
            </div>
          </div>
        </div>
      </nav>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
