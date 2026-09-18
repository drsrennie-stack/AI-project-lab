"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useTab(keys: string[], fallback: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab") ?? fallback;
  const tab = keys.includes(raw) ? raw : fallback;
  const setTab = (k: string) => router.replace(`${pathname}?tab=${k}`, { scroll: false });
  return [tab, setTab] as const;
}
