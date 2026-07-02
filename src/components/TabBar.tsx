'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/today', label: 'Today', icon: '🍽' },
  { href: '/train', label: 'Train', icon: '🏋' },
  { href: '/coach', label: 'Coach', icon: '📈' },
  { href: '/history', label: 'History', icon: '🗓' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-gray-800 bg-[#0a0f1a]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                active ? 'text-blue-400' : 'text-gray-500'
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
