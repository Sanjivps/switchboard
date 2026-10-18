import Link from "next/link";
import { Lamp, SiteNav } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <SiteNav active="/" />
      <main className="mx-auto flex max-w-[1240px] flex-col items-start px-4 py-28 sm:px-6">
        <Lamp status="blocked" size={14} />
        <h1 className="mt-6 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em]">No line at this number</h1>
        <p className="mt-3 max-w-[50ch] text-[17px] leading-[1.6] text-slate">The page you asked for doesn&apos;t exist. The receptionist and the dashboard are both a click away.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo" className="rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-white hover:bg-console-2">Call the demo receptionist</Link>
          <Link href="/" className="rounded-full bg-white px-6 py-3 text-[15px] font-medium shadow-[0_0_0_1px_var(--color-rule)]">Back to the case study</Link>
        </div>
      </main>
    </>
  );
}
