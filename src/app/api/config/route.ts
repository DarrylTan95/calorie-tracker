import { NextResponse } from 'next/server';
import { isAIEnabled } from '@/lib/ai';

export async function GET() {
  return NextResponse.json({ aiEnabled: isAIEnabled() });
}
