"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileEdit } from "lucide-react";

export default function FloatingRequestButton() {
  const pathname = usePathname();
  
  // Hide button on volunteer registration and event registration pages
  // Check for /events/[id]/volunteers/register or /events/[id]/register
  if (pathname) {
    const isVolunteerRegister = /\/events\/[^/]+\/volunteers\/register/.test(pathname);
    const isEventRegister = /\/events\/[^/]+\/register$/.test(pathname);
    
    if (isVolunteerRegister || isEventRegister) {
      return null;
    }
  }

  return (
    <Link
      href="/requests"
      className="fixed bottom-6 left-6 z-50 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition"
      title="בקשות לעריכה"
    >
      <FileEdit size={18} />
      בקשות לעריכה
    </Link>
  );
}
