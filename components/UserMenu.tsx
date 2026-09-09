"use client";

import { useEffect, useState } from "react";
import type { AtlassianUser } from "@/lib/session";

export default function UserMenu() {
  const [user, setUser] = useState<AtlassianUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: AtlassianUser } | null) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => null);
  }, []);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-1 hover:bg-accent transition-colors"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.picture}
            alt={user.name}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <span className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-56 z-20 rounded-xl bg-background shadow-lg border border-border py-1">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground truncate">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <a
              href="/select-site"
              className="block px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              onClick={() => setOpen(false)}
            >
              Switch Jira site
            </a>
            <a
              href="/api/auth/logout"
              className="block px-4 py-2 text-sm text-destructive hover:bg-accent transition-colors"
            >
              Sign out
            </a>
          </div>
        </>
      )}
    </div>
  );
}
