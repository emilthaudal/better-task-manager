"use client";

import { avatarColor, avatarInitials } from "./utils";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

export default function Avatar({ name, size = "md" }: AvatarProps) {
  const dim =
    size === "sm" ? "w-6 h-6 text-[10px]" :
    size === "lg" ? "w-9 h-9 text-[13px]" :
    "w-7 h-7 text-[11px]";
  return (
    <span
      className={`${dim} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: avatarColor(name) }}
      title={name}
    >
      {avatarInitials(name)}
    </span>
  );
}
