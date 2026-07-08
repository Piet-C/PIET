import { NextResponse } from "next/server"
import { makeThumbnail } from "@/lib/thumbnail"

// sharp needs the full Node.js runtime (not the edge runtime).
export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const { key } = await request.json()
    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 })
    }
    const thumbUrl = await makeThumbnail(key)
    return NextResponse.json({ thumbUrl })
  } catch {
    return NextResponse.json({ error: "Thumbnail failed" }, { status: 500 })
  }
}
