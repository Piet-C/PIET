import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import sharp from "sharp"
import { r2, BUCKET } from "@/lib/r2"

export async function makeThumbnail(key: string): Promise<string> {
  const original = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))

  // Read the object as a Node stream and collect it into a clean Buffer.
  const stream = original.Body as unknown as AsyncIterable<Uint8Array>
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  const inputBuffer = Buffer.concat(chunks)

  const thumb = await sharp(inputBuffer)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer()

  const thumbKey = `thumbs/${key}`
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: thumbKey,
    Body: thumb,
    ContentType: "image/jpeg",
  }))

  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${thumbKey}`
}
