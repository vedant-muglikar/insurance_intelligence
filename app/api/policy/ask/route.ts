import { NextRequest, NextResponse } from 'next/server'
import { askPolicyQuestion } from '@/lib/ai/ask'
import type { AskRequest, AskResponse } from '@/lib/types/policy'

export const maxDuration = 120 // seconds — allow long AI calls

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AskRequest

    if (!body.question || typeof body.question !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Question is required and must be a string.' },
        { status: 400 },
      )
    }

    if (!body.pages || !Array.isArray(body.pages) || body.pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Valid extracted pages are required.' },
        { status: 400 },
      )
    }

    const resultData = await askPolicyQuestion(
      body.question,
      body.pages,
      body.history,
      body.scenarioContext
    )

    const response: AskResponse = {
      success: true,
      data: resultData,
    }

    return NextResponse.json(response)
  } catch (err: any) {
    console.error('[policy/ask]', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'An unexpected error occurred while processing the question.',
      },
      { status: 500 },
    )
  }
}
