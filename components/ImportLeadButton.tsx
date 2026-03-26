"use client";

import { useState } from "react";
import { Plus, Loader2, X, Upload } from "lucide-react";

interface ImportLeadButtonProps {
  projectId: string;
  onLeadImported: () => void;
}

export default function ImportLeadButton({ projectId, onLeadImported }: ImportLeadButtonProps) {
  const IMAGINE_ME_PROJECT_ID = "yed4WRBzsXrdGzousyq0";

  // Only show for Imagine Me project
  if (projectId !== IMAGINE_ME_PROJECT_ID) {
    return null;
  }

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleOpenModal = async () => {
    setShowModal(true);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/imagine/list-lydia-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load leads");
      }

      setLeads(data.leads);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportLead = async (lydiaId: string) => {
    setImporting(true);
    setError(null);

    try {
      const res = await fetch("/api/imagine/import-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, lydiaId }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to import lead");
      }

      alert(`✅ ליד יובא בהצלחה!\n\n${data.lead.name}${data.lead.company ? ` - ${data.lead.company}` : ''}`);
      setShowModal(false);
      onLeadImported(); // Reload tasks
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
      >
        <Plus className="w-5 h-5" />
        ייבא ליד חדש מ-Lydia
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">ייבא ליד מ-Lydia</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                </div>
              ) : leads.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Upload className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>אין לידים חדשים לייבוא</p>
                  <p className="text-sm mt-2">כל הלידים מ-Lydia כבר יובאו למערכת</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leads.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1" dir="rtl">
                          <h3 className="font-bold text-gray-900">
                            {lead.customerName}
                            {lead.company && <span className="text-gray-600"> - {lead.company}</span>}
                          </h3>
                          <div className="mt-2 space-y-1 text-sm text-gray-600">
                            {lead.phone && <p>📱 {lead.phone}</p>}
                            {lead.eventType && <p>🎉 {lead.eventType}</p>}
                            {lead.eventDate && <p>📅 {new Date(lead.eventDate).toLocaleDateString('he-IL')}</p>}
                            {lead.eventLocation && <p>📍 {lead.eventLocation}</p>}
                            {lead.estimatedValue && <p>💰 ₪{lead.estimatedValue}</p>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleImportLead(lead.id)}
                          disabled={importing}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                        >
                          {importing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          ייבא
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
