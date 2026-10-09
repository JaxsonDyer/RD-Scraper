"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut, MoreVertical } from "lucide-react";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { useAuth, type AuthUser } from "@/components/auth-provider";

function AccountAvatar({ user, name }: { user: AuthUser; name: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const words = name.trim().split(/\s+/);
  const initials = words.length > 1
    ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();

  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-foreground/10 text-sm font-medium text-sidebar-foreground/80" aria-hidden="true">
      {user.avatarUrl && !imageFailed ? (
        <Image
          src={user.avatarUrl}
          alt=""
          width={44}
          height={44}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="size-full object-cover"
        />
      ) : initials}
    </div>
  );
}

export function SidebarAccount() {
  const { user, isAdmin } = useAuth();
  const signOutForm = useRef<HTMLFormElement>(null);

  if (!user) {
    return (
      <Link href="/login" className="flex min-h-11 items-center rounded-md px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
        Sign in
      </Link>
    );
  }

  const name = user.name || user.email.split("@")[0] || "Account";

  return (
    <div className="flex items-center gap-3">
      <AccountAvatar key={`${user.id}:${user.avatarUrl}`} user={user} name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-5 text-sidebar-foreground" title={name}>{name}</p>
        <p className="truncate text-xs leading-5 text-sidebar-foreground/70" title={user.email}>{user.email}</p>
      </div>
      <MenuTrigger>
        <Button
          aria-label="Account menu"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-foreground/5 focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[pressed]:bg-sidebar-foreground/5"
        >
          <MoreVertical className="size-5" aria-hidden="true" />
        </Button>
        <Popover placement="top end" offset={8} className="z-50 w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground">
          <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Signed in as {isAdmin ? "Admin" : "Viewer"}</p>
          <Menu aria-label="Account options" className="outline-none" onAction={() => signOutForm.current?.requestSubmit()}>
            <MenuItem id="signout" textValue="Sign out" className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none data-[focused]:bg-accent data-[focused]:text-accent-foreground">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      <form ref={signOutForm} action="/auth/signout" method="post" hidden />
    </div>
  );
}
