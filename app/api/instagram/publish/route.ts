import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            accessToken,
            accountId,
            imageUrl,
            videoUrl,
            caption,
            type, // "IMAGE", "VIDEO", "STORY"
            scheduleTime, // Unix timestamp (seconds) or null
            taggedUsers // Array of strings (usernames)
        } = body;

        if (!accessToken || !accountId) {
            return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
        }

        if (type === "STORY" && !imageUrl && !videoUrl) {
            return NextResponse.json({ error: "Story requires image or video URL" }, { status: 400 });
        }

        const version = "v19.0";
        const baseUrl = `https://graph.facebook.com/${version}/${accountId}/media`;
        console.log("IG Publish Request:", baseUrl, { type, scheduleTime, taggedUsers });

        // Helper to resolve usernames to IDs
        const resolveUsernamesToIds = async (usernames: string[]) => {
            const ids: { username: string, id: string }[] = [];
            for (const username of usernames) {
                try {
                    const discoveryUrl = `https://graph.facebook.com/${version}/${accountId}?fields=business_discovery.username(${username}){id}&access_token=${accessToken}`;
                    const res = await fetch(discoveryUrl);
                    const data = await res.json();
                    if (data.business_discovery && data.business_discovery.id) {
                        ids.push({ username, id: data.business_discovery.id });
                    } else {
                        console.warn(`Could not resolve username: ${username}`, data);
                    }
                } catch (e) {
                    console.error(`Error resolving username ${username}:`, e);
                }
            }
            return ids;
        };

        // Step 1: Create Container
        const params = new URLSearchParams();
        params.append("access_token", accessToken);

        // Handle User Tags (Mentions) - Only for Feed posts (IMAGE/VIDEO), not supported for Stories via API
        if (type !== "STORY" && taggedUsers && Array.isArray(taggedUsers) && taggedUsers.length > 0) {
            try {
                const resolvedUsers = await resolveUsernamesToIds(taggedUsers);
                if (resolvedUsers.length > 0) {
                    const userTags = resolvedUsers.map((u, index) => ({
                        user_id: u.id,
                        x: 0.5, // Center
                        y: 0.5 + (index * 0.1) // Offset slightly vertically to avoid total overlap
                    }));
                    params.append("user_tags", JSON.stringify(userTags));
                }
            } catch (tagError) {
                console.warn("Failed to resolve user tags, proceeding without tags:", tagError);
                // We proceed without adding user_tags to params, effectively falling back to a regular post
            }
        }

        if (caption && type !== "STORY") {
            params.append("caption", caption);
        }

        if (type === "STORY") {
            params.append("media_type", "STORIES");
            if (videoUrl) {
                params.append("video_url", videoUrl);
            } else {
                params.append("image_url", imageUrl);
            }
        } else if (type === "VIDEO") {
            params.append("media_type", "VIDEO");
            params.append("video_url", videoUrl);
        } else {
            // IMAGE
            params.append("image_url", imageUrl);
        }

        // Scheduling logic
        if (scheduleTime) {
            // For stories and other media, we just provide the scheduled_publish_time.
            // The 'published' param is often inferred or not needed for scheduling in this context.
            params.append("scheduled_publish_time", scheduleTime.toString());
        }

        const createRes = await fetch(`${baseUrl}?${params.toString()}`, { method: "POST" });
        const createData = await createRes.json();

        if (createData.error) {
            console.error("IG Create Error:", createData.error);
            return NextResponse.json({ error: createData.error.message }, { status: 400 });
        }

        const containerId = createData.id;
        console.log("Container Created:", containerId);

        // Helper to wait for container status
        const waitForContainer = async (id: string) => {
            let attempts = 0;
            const maxAttempts = 10;
            const delay = 3000; // 3 seconds

            while (attempts < maxAttempts) {
                const statusUrl = `https://graph.facebook.com/${version}/${id}?fields=status_code&access_token=${accessToken}`;
                const res = await fetch(statusUrl);
                const data = await res.json();

                console.log(`Container ${id} status (${attempts + 1}/${maxAttempts}):`, data.status_code);

                if (data.status_code === "FINISHED") {
                    return true;
                }
                if (data.status_code === "ERROR") {
                    throw new Error("Media container failed to process");
                }
                if (data.status_code === "EXPIRED") {
                    throw new Error("Media container expired");
                }

                await new Promise(r => setTimeout(r, delay));
                attempts++;
            }
            throw new Error("Media container processing timed out");
        };

        // Wait for container to be ready (essential for videos, good practice for all)
        await waitForContainer(containerId);

        // Step 2: Publish Container (if not scheduled)
        // If scheduled, the container creation with 'scheduled_publish_time' is sufficient.
        // We do NOT need to call media_publish for scheduled posts.
        if (scheduleTime) {
            console.log("Post scheduled, skipping immediate publish.");
            return NextResponse.json({ success: true, id: containerId, status: "SCHEDULED" });
        }

        const publishUrl = `https://graph.facebook.com/${version}/${accountId}/media_publish`;
        const publishParams = new URLSearchParams();
        publishParams.append("access_token", accessToken);
        publishParams.append("creation_id", containerId);

        const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
        const publishData = await publishRes.json();

        if (publishData.error) {
            console.error("IG Publish Error:", publishData.error);
            return NextResponse.json({ error: publishData.error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, id: publishData.id });

    } catch (error: any) {
        console.error("Instagram API Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
