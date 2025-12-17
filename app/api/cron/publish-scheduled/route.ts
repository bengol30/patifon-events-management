import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";

export const dynamic = 'force-dynamic'; // Ensure this route is not cached

export async function GET() {
    try {
        if (!db) {
            throw new Error("Firebase DB not initialized");
        }
        const now = Math.floor(Date.now() / 1000);
        const q = query(collection(db, "scheduled_posts"), where("status", "==", "pending"));
        const snapshot = await getDocs(q);

        const results = [];

        for (const docSnap of snapshot.docs) {
            const post = docSnap.data();
            const postId = docSnap.id;

            // Check if it's time to publish
            if (post.scheduleTime && post.scheduleTime <= now) {
                console.log(`Processing scheduled post ${postId}...`);

                try {
                    const { accessToken, accountId, imageUrl, videoUrl, caption, type, taggedUsers } = post;
                    const version = "v19.0";
                    const baseUrl = `https://graph.facebook.com/${version}/${accountId}/media`;

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

                    // Handle User Tags
                    if (taggedUsers && Array.isArray(taggedUsers) && taggedUsers.length > 0) {
                        try {
                            const resolvedUsers = await resolveUsernamesToIds(taggedUsers);
                            if (resolvedUsers.length > 0) {
                                const userTags = resolvedUsers.map((u, index) => ({
                                    user_id: u.id,
                                    x: 0.5,
                                    y: 0.5 + (index * 0.1)
                                }));
                                params.append("user_tags", JSON.stringify(userTags));
                            }
                        } catch (tagError) {
                            console.warn("Failed to resolve tags, skipping tags:", tagError);
                        }
                    }

                    if (caption && type !== "STORY") {
                        params.append("caption", caption);
                    }

                    if (type === "STORY") {
                        params.append("media_type", "STORIES");
                        if (videoUrl) params.append("video_url", videoUrl);
                        else params.append("image_url", imageUrl);
                    } else if (type === "VIDEO") {
                        params.append("media_type", "VIDEO");
                        params.append("video_url", videoUrl);
                    } else {
                        params.append("image_url", imageUrl);
                    }

                    // Create Container
                    const createRes = await fetch(`${baseUrl}?${params.toString()}`, { method: "POST" });
                    const createData = await createRes.json();

                    if (createData.error) {
                        throw new Error(createData.error.message);
                    }

                    const containerId = createData.id;

                    // Wait for Container
                    const waitForContainer = async (id: string) => {
                        let attempts = 0;
                        const maxAttempts = 10;
                        const delay = 3000;
                        while (attempts < maxAttempts) {
                            const statusUrl = `https://graph.facebook.com/${version}/${id}?fields=status_code&access_token=${accessToken}`;
                            const res = await fetch(statusUrl);
                            const data = await res.json();
                            if (data.status_code === "FINISHED") return true;
                            if (data.status_code === "ERROR" || data.status_code === "EXPIRED") throw new Error("Media processing failed");
                            await new Promise(r => setTimeout(r, delay));
                            attempts++;
                        }
                        throw new Error("Timeout waiting for media");
                    };

                    await waitForContainer(containerId);

                    // Step 2: Publish
                    const publishUrl = `https://graph.facebook.com/${version}/${accountId}/media_publish`;
                    const publishParams = new URLSearchParams();
                    publishParams.append("access_token", accessToken);
                    publishParams.append("creation_id", containerId);

                    const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
                    const publishData = await publishRes.json();

                    if (publishData.error) {
                        throw new Error(publishData.error.message);
                    }

                    // Success! Delete from Firestore
                    await deleteDoc(doc(db, "scheduled_posts", postId));
                    results.push({ id: postId, status: "published", ig_id: publishData.id });

                } catch (err: any) {
                    console.error(`Failed to publish scheduled post ${postId}:`, err);
                    results.push({ id: postId, status: "failed", error: err.message });
                }
            }
        }

        return NextResponse.json({ success: true, processed: results.length, results });

    } catch (error: any) {
        console.error("Cron Job Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
