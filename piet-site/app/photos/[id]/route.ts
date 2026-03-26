import sql from "@/lib/db"
import { NextResponse } from "next/server"

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { title, labels } = await request.json()
  const photo = await sql`
    UPDATE photos SET title = ${title}, labels = ${labels}
    WHERE id = ${params.id}
    RETURNING *
  `
  return NextResponse.json(photo[0])
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await sql`DELETE FROM photos WHERE id = ${params.id}`
  return NextResponse.json({ success: true })
}
