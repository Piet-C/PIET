import { NextResponse } from "next/server"
import sql from "@/lib/db"
import { makeThumbnail } from "@/lib/thumbnail"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 300

function keyFromUrl(url: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL + "/"
  return url.startsWith(base) ? url.slice(base.length) : url.split("/").pop() || url
}

export async function GET() {
  const rows = (await sql`
    SELECT id, image_url FROM photos
    WHERE thumb_url IS NULL
    ORDER BY created_at DESC
  `) as { id: string; image_url: string }[]

  let processed = 0
  let firstError = ""

  for (const row of rows) {
    try {
      const key = keyFromUrl(row.image_url)
      const thumbUrl = await makeThumbnail(key)
      await sql`UPDATE photos SET thumb_url = ${thumbUrl} WHERE id = ${row.id}`
      processed++
    } catch (e) {
      if (!firstError) firstError = (e as Error)?.message || String(e)
    }
  }

  const remaining = (await sql`
    SELECT COUNT(*)::int AS n FROM photos WHERE thumb_url IS NULL
  `) as { n: number }[]

  return NextResponse.json({ processed, remaining: remaining[0].n, firstError })
}
