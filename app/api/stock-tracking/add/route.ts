import { NextRequest, NextResponse } from 'next/server';
import { addStockReport } from '@/lib/stockTracking';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id || !body.company) {
      return NextResponse.json(
        { error: 'Missing required fields: id, company' },
        { status: 400 }
      );
    }

    await addStockReport(body);

    return NextResponse.json({ success: true, id: body.id });
  } catch (error: any) {
    console.error('Error adding stock report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add stock report' },
      { status: 500 }
    );
  }
}
