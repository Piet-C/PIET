import { NextResponse } from "next/server"
import sql from "@/lib/db"
import { makeThumbnail } from "@/lib/thumbnail"

export const runtime = "nodejs"
export const maxDuration = 60

// Turn a stored image_url back into its R2 object key.
function keyFromUrl(url: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL + "/"
  return url.startsWith(base) ? url.slice(base.length) : url.split("/").pop() || url
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get("secret") !== process.env.BACKFILL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Process up to 10 photos that don't have a thumbnail yet.
  const rows = (await sql`
    SELECT id, image_url FROM photos
    WHERE thumb_url IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `) as { id: string; image_url: string }[]

  let processed = 0
  for (const row of rows) {
    try {
      const key = keyFromUrl(row.image_url)
      const thumbUrl = await makeThumbnail(key)
      await sql`UPDATE photos SET thumb_url = ${thumbUrl} WHERE id = ${row.id}`
      processed++
    } catch {
      // skip this one and keep going
    }
  }

  const remaining = (await sql`
    SELECT COUNT(*)::int AS n FROM photos WHERE thumb_url IS NULL
  `) as { n: number }[]

  return NextResponse.json({ processed, remaining: remaining[0].n })
}
