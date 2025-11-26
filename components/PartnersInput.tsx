"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface PartnersInputProps {
    label?: string;
    value: string[];
    onChange: (partners: string[]) => void;
    placeholder?: string;
}

const toPartnerArray = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map((p) => (p || "").toString().trim()).filter(Boolean);
    }
    if (typeof raw === "string") {
        return raw
            .split(/[,\n]/)
            .map((p) => p.trim())
            .filter(Boolean);
    }
    return [];
};

export default function PartnersInput({ label, value, onChange, placeholder }: PartnersInputProps) {
    const [inputValue, setInputValue] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const { user } = useAuth();

    useEffect(() => {
        const fetchPartners = async () => {
            if (!db) return;
            try {
                const names = new Set<string>();
                if (user?.uid) {
                    const q = query(collection(db, "events"), where("members", "array-contains", user.uid));
                    const snapByUser = await getDocs(q);
                    snapByUser.forEach((d) => {
                        const partners = toPartnerArray((d.data() as any).partners);
                        partners.forEach((p) => names.add(p));
                    });
                    // Fallback to all events if none found
                    if (names.size === 0) {
                        const snapAll = await getDocs(collection(db, "events"));
                        snapAll.forEach((d) => {
                            const partners = toPartnerArray((d.data() as any).partners);
                            partners.forEach((p) => names.add(p));
                        });
                    }
                } else {
                    const snapAll = await getDocs(collection(db, "events"));
                    snapAll.forEach((d) => {
                        const partners = toPartnerArray((d.data() as any).partners);
                        partners.forEach((p) => names.add(p));
                    });
                }
                setSuggestions(Array.from(names).sort((a, b) => a.localeCompare(b, "he")));
            } catch (err) {
                console.error("Error fetching partners suggestions", err);
            }
        };
        fetchPartners();
    }, [user]);

    const valueSet = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);

    const filteredSuggestions = useMemo(() => {
        const term = inputValue.trim().toLowerCase();
        if (!term) return [];
        const startsWith = suggestions.filter(
            (s) => s.toLowerCase().startsWith(term) && !valueSet.has(s.toLowerCase())
        );
        const contains = suggestions.filter(
            (s) => s.toLowerCase().includes(term) && !valueSet.has(s.toLowerCase()) && !s.toLowerCase().startsWith(term)
        );
        return [...startsWith, ...contains].slice(0, 8);
    }, [inputValue, suggestions, valueSet]);

    const addPartner = (name: string) => {
        const clean = name.trim();
        if (!clean || valueSet.has(clean.toLowerCase())) return;
        onChange([...value, clean]);
        setInputValue("");
    };

    const removePartner = (name: string) => {
        onChange(value.filter((p) => p !== name));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (["Enter", "Tab", ","].includes(e.key)) {
            if (inputValue.trim()) {
                e.preventDefault();
                addPartner(inputValue);
            }
        }
    };

    return (
        <div className="space-y-2">
            {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
            <div className="flex flex-wrap gap-2">
                {value.map((partner) => (
                    <span
                        key={partner}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                    >
                        {partner}
                        <button
                            type="button"
                            onClick={() => removePartner(partner)}
                            className="text-indigo-500 hover:text-indigo-700"
                            aria-label={`הסר ${partner}`}
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => {
                            if (inputValue.trim()) addPartner(inputValue);
                        }}
                        placeholder={placeholder || "הוסף שותף ולחץ אנטר"}
                        className="min-w-[10rem] rounded-lg border-gray-300 border p-2 pr-8 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
                    />
                    <span className="absolute inset-y-0 right-2 flex items-center text-indigo-500">
                        <Plus size={14} />
                    </span>
                    {filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                            {filteredSuggestions.map((s) => (
                                <button
                                    type="button"
                                    key={s}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => addPartner(s)}
                                    className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
