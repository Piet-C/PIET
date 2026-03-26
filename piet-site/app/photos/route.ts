import sql from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const photos = await sql`
    SELECT * FROM photos ORDER BY created_at DESC
  `
  return NextResponse.json(photos)
}

export async function POST(request: Request) {
  const { title, image_url, labels } = await request.json()
  const photo = await sql`
    INSERT INTO photos (title, image_url, labels)
    VALUES (${title}, ${image_url}, ${labels})
    RETURNING *
  `
  return NextResponse.json(photo[0])
}
