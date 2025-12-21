"use client";
import { useEffect } from "react";

export default function CronScheduler() {
    useEffect(() => {
        // Only run in browser
        if (typeof window === "undefined") return;

        const runCron = async () => {
            const lastRun = localStorage.getItem("lastCronRun");
            if (lastRun && Date.now() - parseInt(lastRun) < 60000) return;

            localStorage.setItem("lastCronRun", Date.now().toString());
            try {
                // console.log("Triggering internal cron job...");
                await fetch("/api/cron/publish-scheduled");
            } catch (e) {
                console.error("Cron trigger failed", e);
            }
        };

        // Run immediately on mount
        runCron();

        // Run every minute
        const interval = setInterval(runCron, 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    return null;
}
