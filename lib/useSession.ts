"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase/client";
import type { Profile } from "./types";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user);
      if (data.user) {
        const { data: p } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
        if (active) setProfile(p as Profile | null);
      }
      if (active) setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading, isInstructor: profile?.role === "instructor" };
}
