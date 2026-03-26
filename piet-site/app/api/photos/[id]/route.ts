import sql from "@/lib/db"
import { NextResponse } from "next/server"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const { title, labels } = await request.json()
  const photo = await sql`
    UPDATE photos SET title = ${title}, labels = ${labels}
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