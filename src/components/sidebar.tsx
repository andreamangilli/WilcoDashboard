"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Megaphone,
  Mail,
  Settings,
  ClipboardList,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ordini", label: "Ordini", icon: ClipboardList },
  { href: "/prodotti", label: "Prodotti", icon: BarChart2 },
  { href: "/shopify", label: "Shopify", icon: ShoppingBag },
  { href: "/amazon", label: "Amazon", icon: Package },
  { href: "/ads", label: "Advertising", icon: Megaphone },
  { href: "/klaviyo", label: "Klaviyo", icon: Mail },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col bg-gray-950 border-r border-white/[0.06]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-white/[0.06]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 shrink-0">
          <span className="text-xs font-bold text-white">W</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">Wilco Group</p>
          <p className="text-[10px] text-gray-500 leading-tight mt-0.5">Analytics</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2.5 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-gray-500 hover:bg-white/[0.05] hover:text-gray-200"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-amber-400" : "text-current"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
