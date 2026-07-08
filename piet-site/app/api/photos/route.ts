import sql from "@/lib/db"
import { NextResponse } from "next/server"

// Return all photos (newest first) for the gallery.
export async function GET() {
  const photos = await sql`
    SELECT * FROM photos
    ORDER BY created_at DESC
  `
  return NextResponse.json(photos)
}

// Save a newly uploaded photo.
export async function POST(request: Request) {
  const body = await request.json()
  const title = body.title ?? ""
  const image_url = body.image_url
  const labels = body.labels ?? "[]"
  const thumb_url = body.thumb_url ?? null

  const photo = await sql`
    INSERT INTO photos (title, image_url, labels, thumb_url)
    VALUES (${title}, ${image_url}, ${labels}, ${thumb_url})
    RETURNING *
  `
  return NextResponse.json(photo[0])
}
