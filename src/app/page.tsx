import { Bebas_Neue } from "next/font/google";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/landing/landing-page";

const marketingFont = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-helios-display", display: "swap" });

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return <div className={marketingFont.variable}><LandingPage /></div>;
}
