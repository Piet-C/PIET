import sql from "@/lib/db"
import { NextResponse } from "next/server"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await request.json()

  const title = body.title ?? null
  const labels = body.labels ?? null
  const image_url = body.image_url ?? null
  const thumb_url = body.thumb_url ?? null

  const photo = await sql`
    UPDATE photos
    SET title     = COALESCE(${title}, title),
        labels    = COALESCE(${labels}, labels),
        image_url = COALESCE(${image_url}, image_url),
        thumb_url = COALESCE(${thumb_url}, thumb_url)
    WHERE id = ${id}
    RETURNING *
  `
  return NextResponse.json(photo[0])
}

export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  await sql`DELETE FROM photos WHERE id = ${id}`
  return NextResponse.json({ success: true })
}
