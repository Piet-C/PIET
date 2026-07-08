import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import sharp from "sharp"
import sql from "@/lib/db"
import { r2, BUCKET } from "@/lib/r2"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  let stage = "start"
  const info: Record<string, unknown> = {}
  try {
    const rows = (await sql`
      SELECT id, image_url FROM photos WHERE thumb_url IS NULL LIMIT 1
    `) as { id: string; image_url: string }[]
    if (rows.length === 0) return NextResponse.json({ message: "nothing to do" })

    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL + "/"
    const url = rows[0].image_url
    const key = url.startsWith(base) ? url.slice(base.length) : url.split("/").pop()!
    info.key = key

    stage = "fetch"
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))

    stage = "read"
    const chunks: Buffer[] = []
    for await (const chunk of obj.Body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk))
    }
    const inputBuffer = Buffer.concat(chunks)
    info.bytes = inputBuffer.length
    info.isBuffer = Buffer.isBuffer(inputBuffer)
    info.backing = inputBuffer.buffer?.constructor?.name

    stage = "sharp"
    const thumb = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    info.thumbBytes = thumb.length

    stage = "put"
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `thumbs/${key}`,
      Body: thumb,
      ContentType: "image/jpeg",
    }))

    stage = "done"
    return NextResponse.json({ ok: true, stage, info })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      failedAtStage: stage,
      info,
      error: (e as Error)?.message || String(e),
    })
  }
}
