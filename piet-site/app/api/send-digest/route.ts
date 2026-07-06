import sql from "@/lib/db"
import { NextResponse } from "next/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

type PhotoRow = {
  id: string
  title: string
  image_url: string
  created_at: string
}

export async function GET(request: Request) {
  // Only allow Vercel Cron (or you, with the secret) to trigger this.
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Photos added in the last ~month.
  const photos = (await sql`
    SELECT id, title, image_url, created_at
    FROM photos
    WHERE created_at > NOW() - INTERVAL '31 days'
    ORDER BY created_at DESC
    LIMIT 12
  `) as PhotoRow[]

  if (photos.length === 0) {
    return NextResponse.json({ sent: 0, reason: "No new photos this month" })
  }

  const subscribers = (await sql`SELECT email FROM subscribers`) as { email: string }[]
  if (subscribers.length === 0) {
    return NextResponse.json({ sent: 0, reason: "No subscribers" })
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://piet.world"

  const grid = photos
    .map(
      (p) => `
      <a href="${site}" style="display:inline-block;width:31%;margin:1%;text-decoration:none;">
        <img src="${p.image_url}" alt="${p.title || ""}"
             style="width:100%;height:120px;object-fit:cover;border-radius:8px;display:block;" />
      </a>`
    )
    .join("")

  // Resend allows batching; send one email per subscriber so each unsubscribe
  // link is personal.
  const results = await Promise.allSettled(
    subscribers.map((s) =>
      resend.emails.send({
        from: "PIET <newsletter@piet.world>",
        to: s.email,
        subject: "New photos on piet.world",
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;background:#000;color:#fff;padding:24px;border-radius:16px;">
            <h1 style="font-weight:500;letter-spacing:4px;font-size:20px;margin:0 0 16px;">PIET</h1>
            <p style="color:#bbb;font-size:14px;margin:0 0 20px;">Here are the latest photos I added this month.</p>
            <div style="font-size:0;">${grid}</div>
            <p style="margin:24px 0 0;">
              <a href="${site}" style="color:#fff;font-size:14px;">View them all &rarr;</a>
            </p>
            <p style="margin:24px 0 0;color:#666;font-size:12px;">
              <a href="${site}/api/unsubscribe?email=${encodeURIComponent(s.email)}" style="color:#666;">Unsubscribe</a>
            </p>
          </div>`,
      })
    )
  )

  const sent = results.filter((r) => r.status === "fulfilled").length
  return NextResponse.json({ sent, total: subscribers.length, photos: photos.length })
}
