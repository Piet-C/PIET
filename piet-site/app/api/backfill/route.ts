import { NextResponse } from "next/server"
import sql from "@/lib/db"
import { makeThumbnail } from "@/lib/thumbnail"

export const runtime = "nodejs"
export const maxDuration = 60

function keyFromUrl(url: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL + "/"
  return url.startsWith(base) ? url.slice(base.length) : url.split("/").pop() || url
}

export async function GET() {
  const rows = (await sql`
    SELECT id, image_url FROM photos
    WHERE thumb_url IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `) as { id: string; image_url: string }[]

  if (rows.length === 0) return NextResponse.json({ message: "nothing to do" })

  const row = rows[0]
  const key = keyFromUrl(row.image_url)

  try {
    const thumbUrl = await makeThumbnail(key)
    await sql`UPDATE photos SET thumb_url = ${thumbUrl} WHERE id = ${row.id}`
    return NextResponse.json({ ok: true, key, thumbUrl })
  } catch (e) {
    return
