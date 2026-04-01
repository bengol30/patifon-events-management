import { db } from './firebase';
import { collection, doc, setDoc, getDocs, getDoc, query, orderBy, Timestamp } from 'firebase/firestore';

export interface StockReport {
  id: string;
  company: string;
  updatedAt: string;
  source: string;
  sourceUrl: string;
  price: number;
  monthly: number;
  yearly: number;
  rsi: number;
  summary: string[];
  supports: string[];
  resistances: string[];
  keyTakeaways: string[];
  ma: {
    ma20: number;
    ma50: number;
    ma100: number;
    ma200: number;
  };
  entryPlans: {
    title: string;
    body: string;
    range?: string;
  }[];
  claims: string[];
  sources: string[];
  fullTextSections: {
    title: string;
    body: string;
  }[];
  activeMonitoring?: {
    trackBeyondPrice: string[];
    entryCatalysts: string[];
    redFlags: string[];
    checkpoints: {
      date?: string;
      event: string;
      action: string;
    }[];
    additionalConsiderations: string[];
  };
  entryScore?: {
    score: number;              // 0-100
    technical: number;          // 0-50 (מניתוח טכני)
    fundamental: number;        // 0-50 (מניתוח פונדמנטלי)
    reasoning: string;          // הסבר מפורט
    recommendation: 'strong-buy' | 'buy' | 'hold' | 'wait' | 'avoid';
    lastCalculated: string;     // תאריך חישוב
  };
  createdAt: Timestamp;
  updatedAtTimestamp: Timestamp;
}

const COLLECTION_NAME = 'stockTracking';

export async function addStockReport(report: Omit<StockReport, 'createdAt' | 'updatedAtTimestamp'>): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const now = Timestamp.now();
  const docRef = doc(db, COLLECTION_NAME, report.id);
  await setDoc(docRef, {
    ...report,
    createdAt: now,
    updatedAtTimestamp: now,
  });
}

export async function getStockReport(id: string): Promise<StockReport | null> {
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, COLLECTION_NAME, id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return docSnap.data() as StockReport;
}

export async function getAllStockReports(): Promise<StockReport[]> {
  if (!db) throw new Error('Firestore not initialized');
  const q = query(collection(db, COLLECTION_NAME), orderBy('updatedAtTimestamp', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as StockReport);
}

export async function updateStockReport(id: string, updates: Partial<Omit<StockReport, 'id' | 'createdAt'>>): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, COLLECTION_NAME, id);
  await setDoc(docRef, {
    ...updates,
    updatedAtTimestamp: Timestamp.now(),
  }, { merge: true });
}
