import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import sharp from "sharp"
import { r2, BUCKET } from "@/lib/r2"

export async function makeThumbnail(key: string): Promise<string> {
  const original = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const bytes = await original.Body!.transformToByteArray()

  const inputBuffer = Buffer.alloc(bytes.byteLength)
  inputBuffer.set(bytes)

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
