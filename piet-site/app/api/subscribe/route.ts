import sql from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { email } = await request.json()

  const clean = String(email || "").trim().toLowerCase()
  if (!clean || !clean.includes("@") || !clean.includes(".")) {
    return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 })
  }

  try {
    await sql`
      INSERT INTO subscribers (email)
      VALUES (${clean})
      ON CONFLICT (email) DO NOTHING
    `
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
