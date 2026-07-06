import sql from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = String(searchParams.get("email") || "").trim().toLowerCase()
  if (email) {
    await sql`DELETE FROM subscribers WHERE email = ${email}`
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://piet.world"
  return NextResponse.redirect(new URL("/?unsubscribed=1", site))
}
