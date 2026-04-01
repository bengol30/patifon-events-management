import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const docRef = doc(db, 'stockTracking', id);
    await deleteDoc(docRef);

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error deleting stock report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete stock report' },
      { status: 500 }
    );
  }
}
