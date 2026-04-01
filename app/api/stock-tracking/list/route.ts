import { NextResponse } from 'next/server';
import { getAllStockReports } from '@/lib/stockTracking';

export async function GET() {
  try {
    const reports = await getAllStockReports();
    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error('Error fetching stock reports:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stock reports' },
      { status: 500 }
    );
  }
}
