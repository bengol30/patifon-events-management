"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, updateDoc, doc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

interface Message {
    id: string;
    text: string;
    senderName: string;
    senderUid: string;
    timestamp: any;
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

    useEffect(() => {
        if (!db || !eventId || !taskId) return;

        const messagesRef = collection(db, "events", eventId, "tasks", taskId, "messages");
        const q = query(messagesRef, orderBy("timestamp", "asc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messagesData: Message[] = [];
            snapshot.forEach((doc) => {
                messagesData.push({ id: doc.id, ...doc.data() } as Message);
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
                timestamp: serverTimestamp(),
            });

            // Update task's lastMessageTime
            const taskRef = doc(db, "events", eventId, "tasks", taskId);
            await updateDoc(taskRef, {
                lastMessageTime: serverTimestamp(),
                lastMessageBy: user.uid,
            });

            setNewMessage("");
        } catch (err) {
            console.error("Error sending message:", err);
            alert("שגיאה בשליחת ההודעה");
        }
    };

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
                            const isMyMessage = message.senderUid === user?.uid;
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
                                            {message.timestamp?.seconds
                                                ? new Date(message.timestamp.seconds * 1000).toLocaleTimeString("he-IL", {
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
                <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="כתוב הודעה..."
                            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            dir="auto"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="patifon-gradient text-white px-6 py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Send size={18} />
                            שלח
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
