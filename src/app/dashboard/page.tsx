import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { SiteNav } from "@/components/ui";
import { AGENCY, getDashboardData } from "@/lib/dashboard-data";

export const metadata: Metadata = {
  title: "Agency dashboard | Switchboard",
  description: "One white-label view across every client's AI receptionist: calls, bookings, revenue, approvals and guardrail traces.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return (
    <>
      <SiteNav active="/dashboard" />
      <main>
        <Dashboard data={data} agency={AGENCY} />
      </main>
    </>
  );
}
