import type { Metadata } from "next";
import { CallConsole } from "@/components/call-console";
import { SiteNav } from "@/components/ui";

export const metadata: Metadata = {
  title: "Live demo | Switchboard",
  description: "Talk to the AI receptionist and watch every guardrail check in real time.",
};

export default function DemoPage() {
  return (
    <>
      <SiteNav active="/demo" wide />
      <main>
        <CallConsole />
      </main>
    </>
  );
}
