"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc } from "firebase/firestore";
import { Plus, Trash2, X, Edit2, FileText, FolderOpen, ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";

interface DocumentCategory {
    id: string;
    name: string;
    description?: string;
    createdAt: any;
}

interface Document {
    id: string;
    categoryId: string;
    title: string;
    description?: string;
    fileUrl?: string;
    fileName?: string;
    createdAt: any;
}

const PREDEFINED_CATEGORIES = [
    {
        name: "טפסים",
        description: "טפסים חשובים לניהול האירוע",
        documents: [
            {
                title: "טופס פתיחת ספק",
                description: "טופס לפתיחת ספק חדש במערכת הפיננסית. יש למלא לפני ביצוע תשלום ראשון לספק.",
                fileUrl: "",
                fileName: "טופס_פתיחת_ספק.pdf"
            },
            {
                title: "טופס אפיון לגרפיקה",
                description: "טופס מפורט לאפיון עבודת גרפיקה - כולל פרטי האירוע, דרישות עיצוב, לוגואים נדרשים ולו\"ז.",
                fileUrl: "",
                fileName: "טופס_אפיון_גרפיקה.pdf"
            },
            {
                title: "טופס הזמנת ציוד",
                description: "טופס להזמנת ציוד טכני לאירוע - הגברה, תאורה, במה וכו'.",
                fileUrl: "",
                fileName: "טופס_הזמנת_ציוד.pdf"
            }
        ]
    },
    {
        name: "תבניות",
        description: "תבניות לשימוש חוזר",
        documents: [
            {
                title: "תבנית הזמנה לאירוע",
                description: "תבנית עיצוב להזמנה דיגיטלית לאירוע - ניתן להתאמה אישית.",
                fileUrl: "",
                fileName: "תבנית_הזמנה.psd"
            },
            {
                title: "תבנית פוסט לרשתות חברתיות",
                description: "תבנית מעוצבת לפרסום אירועים ברשתות החברתיות.",
                fileUrl: "",
                fileName: "תבנית_פוסט.psd"
            }
        ]
    },
    {
        name: "מדריכים",
        description: "מדריכים והנחיות עבודה",
        documents: [
            {
                title: "מדריך עבודה עם ספקים",
                description: "הנחיות מפורטות לעבודה עם ספקים - מהצעת מחיר ועד תשלום סופי.",
                fileUrl: "",
                fileName: "מדריך_ספקים.pdf"
            },
            {
                title: "צ'קליסט לפני אירוע",
                description: "רשימת בדיקות מקיפה לוודא שהכל מוכן שבוע לפני האירוע.",
                fileUrl: "",
                fileName: "checklist_אירוע.pdf"
            }
        ]
    }
];

export default function ImportantDocuments() {
    const [categories, setCategories] = useState<DocumentCategory[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // Modals
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showSeedModal, setShowSeedModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Partial<DocumentCategory>>({});
    const [editingDocument, setEditingDocument] = useState<Partial<Document>>({});
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

    useEffect(() => {
        if (!db) return;

        // Fetch categories
        const categoriesQuery = query(collection(db, "document_categories"), orderBy("createdAt", "desc"));
        const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
            const cats = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as DocumentCategory[];
            setCategories(cats);
        });

        // Fetch documents
        const documentsQuery = query(collection(db, "important_documents"), orderBy("createdAt", "desc"));
        const unsubscribeDocuments = onSnapshot(documentsQuery, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Document[];
            setDocuments(docs);
        });

        return () => {
            unsubscribeCategories();
            unsubscribeDocuments();
        };
    }, []);

    const handleAddCategory = () => {
        setEditingCategory({ name: "", description: "" });
        setShowCategoryModal(true);
    };

    const handleEditCategory = (category: DocumentCategory) => {
        setEditingCategory({ ...category });
        setShowCategoryModal(true);
    };

    const handleSaveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !editingCategory.name) return;

        try {
            if (editingCategory.id) {
                await updateDoc(doc(db, "document_categories", editingCategory.id), {
                    name: editingCategory.name,
                    description: editingCategory.description || "",
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, "document_categories"), {
                    name: editingCategory.name,
                    description: editingCategory.description || "",
                    createdAt: serverTimestamp()
                });
            }
            setShowCategoryModal(false);
        } catch (err) {
            console.error("Error saving category:", err);
            alert("שגיאה בשמירת הקטגוריה");
        }
    };

    const handleDeleteCategory = async (categoryId: string) => {
        if (!confirm("האם למחוק קטגוריה זו? כל המסמכים בה יימחקו גם כן.")) return;
        if (!db) return;

        try {
            // Delete all documents in this category
            const categoryDocs = documents.filter(d => d.categoryId === categoryId);
            for (const document of categoryDocs) {
                await deleteDoc(doc(db, "important_documents", document.id));
            }
            // Delete category
            await deleteDoc(doc(db, "document_categories", categoryId));
        } catch (err) {
            console.error("Error deleting category:", err);
            alert("שגיאה במחיקת הקטגוריה");
        }
    };

    const handleAddDocument = (categoryId: string) => {
        setSelectedCategoryId(categoryId);
        setEditingDocument({ categoryId, title: "", description: "", fileUrl: "", fileName: "" });
        setShowDocumentModal(true);
    };

    const handleEditDocument = (document: Document) => {
        setEditingDocument({ ...document });
        setShowDocumentModal(true);
    };

    const handleSaveDocument = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !editingDocument.title) return;

        try {
            const docData = {
                categoryId: editingDocument.categoryId,
                title: editingDocument.title,
                description: editingDocument.description || "",
                fileUrl: editingDocument.fileUrl || "",
                fileName: editingDocument.fileName || "",
                updatedAt: serverTimestamp()
            };

            if (editingDocument.id) {
                await updateDoc(doc(db, "important_documents", editingDocument.id), docData);
            } else {
                await addDoc(collection(db, "important_documents"), {
                    ...docData,
                    createdAt: serverTimestamp()
                });
            }
            setShowDocumentModal(false);
        } catch (err) {
            console.error("Error saving document:", err);
            alert("שגיאה בשמירת המסמך");
        }
    };

    const handleDeleteDocument = async (documentId: string) => {
        if (!confirm("האם למחוק מסמך זה?")) return;
        if (!db) return;

        try {
            await deleteDoc(doc(db, "important_documents", documentId));
        } catch (err) {
            console.error("Error deleting document:", err);
            alert("שגיאה במחיקת המסמך");
        }
    };

    const handleOpenDocument = (fileUrl?: string) => {
        if (!fileUrl) return;
        window.open(fileUrl, "_blank", "noopener,noreferrer");
    };

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const getCategoryDocuments = (categoryId: string) => {
        return documents.filter(d => d.categoryId === categoryId);
    };

    const handleSeedDefaults = async () => {
        if (!db) return;
        setShowSeedModal(false);

        try {
            for (const category of PREDEFINED_CATEGORIES) {
                // Create category
                const categoryRef = await addDoc(collection(db, "document_categories"), {
                    name: category.name,
                    description: category.description,
                    createdAt: serverTimestamp()
                });

                // Create documents for this category
                for (const document of category.documents) {
                    await addDoc(collection(db, "important_documents"), {
                        categoryId: categoryRef.id,
                        title: document.title,
                        description: document.description,
                        fileUrl: document.fileUrl,
                        fileName: document.fileName,
                        createdAt: serverTimestamp()
                    });
                }
            }
            alert("ברירות המחדל נטענו בהצלחה!");
        } catch (err) {
            console.error("Error seeding defaults:", err);
            alert("שגיאה בטעינת ברירות המחדל");
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">מסמכים חשובים</h2>
                    <p className="text-gray-500 text-sm">
                        ארגן מסמכים חשובים לפי קטגוריות - טפסים, תבניות, מדריכים ועוד
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowSeedModal(true)}
                        className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 border border-indigo-200"
                        title="טען קטגוריות ומסמכים מוכנים מראש"
                    >
                        <RefreshCw size={16} />
                        <span className="hidden sm:inline">טען ברירות מחדל</span>
                    </button>
                    <button
                        onClick={handleAddCategory}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium shadow-sm"
                    >
                        <Plus size={16} />
                        קטגוריה חדשה
                    </button>
                </div>
            </div>

            {/* Categories List */}
            <div className="space-y-3">
                {categories.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <FolderOpen className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">אין קטגוריות עדיין</p>
                        <p className="text-gray-400 text-sm mt-1">צור קטגוריה ראשונה כדי להתחיל</p>
                    </div>
                ) : (
                    categories.map(category => {
                        const categoryDocs = getCategoryDocuments(category.id);
                        const isExpanded = expandedCategories.has(category.id);

                        return (
                            <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                {/* Category Header */}
                                <div className="bg-gray-50 p-4 flex items-center justify-between hover:bg-gray-100 transition">
                                    <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleCategory(category.id)}>
                                        <button className="text-gray-400 hover:text-gray-600">
                                            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                        </button>
                                        <FolderOpen className="text-indigo-600" size={20} />
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-gray-900">{category.name}</h3>
                                            {category.description && (
                                                <p className="text-sm text-gray-500">{category.description}</p>
                                            )}
                                        </div>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                                            {categoryDocs.length} מסמכים
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mr-3">
                                        <button
                                            onClick={() => handleAddDocument(category.id)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                            title="הוסף מסמך"
                                        >
                                            <Plus size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleEditCategory(category)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                            title="ערוך קטגוריה"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCategory(category.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="מחק קטגוריה"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Documents List */}
                                {isExpanded && (
                                    <div className="bg-white p-4 space-y-2">
                                        {categoryDocs.length === 0 ? (
                                            <p className="text-gray-400 text-sm text-center py-4">אין מסמכים בקטגוריה זו</p>
                                        ) : (
                                            categoryDocs.map(document => (
                                                <div
                                                    key={document.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => handleOpenDocument(document.fileUrl)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            handleOpenDocument(document.fileUrl);
                                                        }
                                                    }}
                                                    className={`flex items-center justify-between p-3 border border-gray-100 rounded-lg transition group ${document.fileUrl ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
                                                >
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <FileText className="text-gray-400" size={18} />
                                                        <div className="flex-1">
                                                            <h4 className="font-medium text-gray-900">{document.title}</h4>
                                                            {document.description && (
                                                                <p className="text-sm text-gray-500">{document.description}</p>
                                                            )}
                                                            {document.fileName && (
                                                                <p className="text-xs text-gray-400 mt-1">📎 {document.fileName}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {document.fileUrl && (
                                                            <a
                                                                href={document.fileUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                                                                title="פתח קישור"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <Download size={16} />
                                                            </a>
                                                        )}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditDocument(document); }}
                                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                            title="ערוך"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteDocument(document.id); }}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                            title="מחק"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Seed Confirmation Modal */}
            {showSeedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3 text-indigo-600">
                                <div className="bg-indigo-100 p-2 rounded-full">
                                    <RefreshCw size={24} />
                                </div>
                                <h3 className="text-lg font-bold">טעינת ברירות מחדל</h3>
                            </div>
                            <button onClick={() => setShowSeedModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="text-gray-600 mb-6">
                            <p className="mb-2">
                                פעולה זו תוסיף {PREDEFINED_CATEGORIES.length} קטגוריות עם מסמכים מוכנים מראש:
                            </p>
                            <ul className="list-disc list-inside text-sm mb-2">
                                {PREDEFINED_CATEGORIES.map((cat, idx) => (
                                    <li key={idx}>{cat.name} ({cat.documents.length} מסמכים)</li>
                                ))}
                            </ul>
                            <p>האם להמשיך?</p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowSeedModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={handleSeedDefaults}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition shadow-sm"
                            >
                                כן, טען ברירות מחדל
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">{editingCategory.id ? "עריכת קטגוריה" : "קטגוריה חדשה"}</h3>
                            <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCategory} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">שם הקטגוריה</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingCategory.name || ""}
                                    onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                    placeholder="לדוגמה: טפסים"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                                <textarea
                                    rows={2}
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingCategory.description || ""}
                                    onChange={e => setEditingCategory({ ...editingCategory, description: e.target.value })}
                                    placeholder="תיאור קצר של הקטגוריה..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowCategoryModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">ביטול</button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">שמור</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Document Modal */}
            {showDocumentModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">{editingDocument.id ? "עריכת מסמך" : "מסמך חדש"}</h3>
                            <button onClick={() => setShowDocumentModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveDocument} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">שם המסמך</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingDocument.title || ""}
                                    onChange={e => setEditingDocument({ ...editingDocument, title: e.target.value })}
                                    placeholder="לדוגמה: טופס פתיחת ספק"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                                <textarea
                                    rows={3}
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingDocument.description || ""}
                                    onChange={e => setEditingDocument({ ...editingDocument, description: e.target.value })}
                                    placeholder="הסבר מה המסמך ואיך להשתמש בו..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">קישור למסמך (Google Drive / Dropbox וכו')</label>
                                <input
                                    type="url"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingDocument.fileUrl || ""}
                                    onChange={e => setEditingDocument({ ...editingDocument, fileUrl: e.target.value })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">שם הקובץ (אופציונלי)</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingDocument.fileName || ""}
                                    onChange={e => setEditingDocument({ ...editingDocument, fileName: e.target.value })}
                                    placeholder="לדוגמה: טופס_ספק.pdf"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowDocumentModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">ביטול</button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">שמור</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
