import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { Profile, Vehicle } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <p className="max-w-md rounded bg-white p-6 text-center shadow">
          Your profile has not been created yet. Please sign out and sign in again, or
          contact an administrator.
        </p>
      </main>
    );
  }

  // RLS decides what comes back: operators get pending rows only, inspectors get all.
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Vehicle[]>();

  return <Dashboard profile={profile} initialVehicles={vehicles ?? []} />;
}
