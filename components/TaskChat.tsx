"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle, AtSign } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, updateDoc, doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

interface Message {
    id: string;
    text: string;
    senderName: string;
    senderUid?: string;
    senderId?: string;
    createdAt?: any;
    timestamp?: any;
}

interface TaskChatProps {
    eventId: string;
    taskId: string;
    taskTitle: string;
    onClose: () => void;
}

export default function TaskChat({ eventId, taskId, taskTitle, onClose }: TaskChatProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [team, setTeam] = useState<{ name: string; userId?: string; email?: string }[]>([]);
    const [mentionActive, setMentionActive] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [pendingMentions, setPendingMentions] = useState<{ name: string; userId?: string; email?: string }[]>([]);

    useEffect(() => {
        if (!db || !eventId || !taskId) return;

        const loadTeam = async () => {
            try {
                const evSnap = await getDoc(doc(db, "events", eventId));
                if (evSnap.exists()) {
                    const data = evSnap.data() as any;
                    setTeam((data.team as any[]) || []);
                }
            } catch (err) {
                console.error("Failed loading team for mentions", err);
            }
        };
        loadTeam();

        const messagesRef = collection(db, "events", eventId, "tasks", taskId, "messages");
        // Use createdAt if exists, fallback to timestamp for legacy docs
        const q = query(messagesRef, orderBy("createdAt", "asc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messagesData: Message[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as any;
                if (!data.createdAt && data.timestamp) {
                    // Backfill legacy messages to use createdAt so ordering is consistent everywhere
                    updateDoc(doc.ref, { createdAt: data.timestamp }).catch(() => { /* ignore */ });
                }
                messagesData.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt || data.timestamp,
                    senderId: data.senderId || data.senderUid,
                    senderUid: data.senderUid || data.senderId,
                } as Message);
            });
            setMessages(messagesData);
            setLoading(false);

            // Mark messages as read
            if (user) {
                markMessagesAsRead();
            }
        });

        return () => unsubscribe();
    }, [eventId, taskId, user]);

    useEffect(() => {
        // Scroll to bottom when new messages arrive
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const markMessagesAsRead = async () => {
        if (!db || !user) return;

        try {
            const taskRef = doc(db, "events", eventId, "tasks", taskId);
            await updateDoc(taskRef, {
                [`readBy.${user.uid}`]: serverTimestamp()
            });
        } catch (err) {
            console.error("Error marking messages as read:", err);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !db || !user) return;

        try {
            const messagesRef = collection(db, "events", eventId, "tasks", taskId, "messages");
            await addDoc(messagesRef, {
                text: newMessage.trim(),
                senderName: user.displayName || user.email || "משתמש",
                senderUid: user.uid,
                senderId: user.uid,
                createdAt: serverTimestamp(),
                timestamp: serverTimestamp(), // legacy field for older queries
                mentions: pendingMentions
            });

            // Update task's lastMessageTime
            const taskRef = doc(db, "events", eventId, "tasks", taskId);
            await updateDoc(taskRef, {
                lastMessageTime: serverTimestamp(),
                lastMessageBy: user.uid,
                lastMessageText: newMessage.trim(),
                lastMessageMentions: pendingMentions,
            });

            setNewMessage("");
            setPendingMentions([]);
            setMentionActive(false);
            setMentionQuery("");
            setMentionStart(null);
        } catch (err) {
            console.error("Error sending message:", err);
            alert("שגיאה בשליחת ההודעה");
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const cursor = e.target.selectionStart || value.length;
        const lastAt = value.lastIndexOf("@", cursor - 1);
        if (lastAt >= 0) {
            const after = value.slice(lastAt + 1, cursor);
            if (!after.includes(" ")) {
                setMentionActive(true);
                setMentionQuery(after);
                setMentionStart(lastAt);
            } else {
                setMentionActive(false);
            }
        } else {
            setMentionActive(false);
        }
        setNewMessage(value);
    };

    const handlePickMention = (member: { name: string; userId?: string; email?: string }) => {
        if (!inputRef.current) return;
        const value = newMessage;
        const start = mentionStart ?? value.length;
        const cursor = inputRef.current.selectionStart || value.length;
        const before = value.slice(0, start);
        const after = value.slice(cursor);
        const mentionText = `@${member.name} `;
        const next = before + mentionText + after;
        setNewMessage(next);
        setMentionActive(false);
        setMentionQuery("");
        setMentionStart(null);
        setPendingMentions(prev => {
            const exists = prev.some(m =>
                (m.userId && member.userId && m.userId === member.userId) ||
                (m.email && member.email && m.email.toLowerCase() === member.email.toLowerCase()) ||
                m.name === member.name
            );
            return exists ? prev : [...prev, member];
        });
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const filteredMentions = mentionActive
        ? team.filter(m => (m.name || "").toLowerCase().includes(mentionQuery.toLowerCase()))
        : [];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full h-[600px] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4" style={{ borderBottom: '2px solid var(--patifon-cream-dark)' }}>
                    <div className="flex items-center gap-2">
                        <MessageCircle style={{ color: 'var(--patifon-red)' }} size={24} />
                        <div>
                            <h3 className="text-lg font-bold" style={{ color: 'var(--patifon-burgundy)' }}>צ'אט הודעות</h3>
                            <p className="text-sm" style={{ color: 'var(--patifon-orange)' }}>{taskTitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="hover:opacity-70 transition"
                        style={{ color: 'var(--patifon-burgundy)' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'var(--patifon-cream)' }}>
                    {loading ? (
                        <div className="text-center text-gray-500 py-8">טוען הודעות...</div>
                    ) : messages.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            אין הודעות עדיין. היה הראשון לכתוב!
                        </div>
                    ) : (
        messages.map((message) => {
            const isMyMessage = (message.senderUid || message.senderId) === user?.uid;
                            return (
                                <div
                                    key={message.id}
                                    className={`flex ${isMyMessage ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className="max-w-[70%] rounded-lg p-3"
                                        style={isMyMessage
                                            ? { background: 'linear-gradient(135deg, var(--patifon-orange), var(--patifon-yellow-orange))', color: 'white' }
                                            : { background: 'white', color: 'var(--patifon-burgundy)', border: '2px solid var(--patifon-cream-dark)' }
                                        }
                                    >
                                        {!isMyMessage && (
                                            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--patifon-red)' }}>
                                                {message.senderName}
                                            </p>
                                        )}
                                        <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                                        <p
                                            className={`text-xs mt-1 ${isMyMessage ? "text-indigo-200" : "text-gray-400"
                                                }`}
                                        >
                                            {(message.createdAt?.seconds || message.timestamp?.seconds)
                                                ? new Date((message.createdAt?.seconds || message.timestamp.seconds) * 1000).toLocaleTimeString("he-IL", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })
                                                : "שולח..."}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white relative">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            ref={inputRef}
                            value={newMessage}
                            onChange={handleInputChange}
                            placeholder="כתוב הודעה... לחץ @ או על האייקון כדי לתייג איש צוות"
                            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            dir="auto"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setMentionActive(!mentionActive);
                                if (!mentionActive) {
                                    setMentionQuery("");
                                    setMentionStart(newMessage.length);
                                }
                            }}
                            className="p-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                            title="תייג איש צוות"
                        >
                            <AtSign size={16} />
                        </button>
                        <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="patifon-gradient text-white px-6 py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Send size={18} />
                            שלח
                        </button>
                    </div>
                    {mentionActive && filteredMentions.length > 0 && (
                        <div className="absolute bottom-16 right-4 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 w-64 overflow-y-auto z-20">
                            {filteredMentions.map((m, idx) => (
                                <button
                                    key={`${m.userId || m.email || m.name}-${idx}`}
                                    type="button"
                                    onClick={() => handlePickMention(m)}
                                    className="w-full text-right px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0 border-gray-100"
                                >
                                    <div className="font-semibold text-gray-900 truncate">{m.name || m.email || "משתמש"}</div>
                                    <div className="text-xs text-gray-500 truncate">{m.email || m.userId || ""}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
