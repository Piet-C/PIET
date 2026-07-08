import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import sharp from "sharp"
import { r2, BUCKET } from "@/lib/r2"

// Given the key of an original photo already in R2 (e.g. "1775233012947_IMG_5978-2.jpg"),
// this reads it, makes a small ~800px-wide thumbnail, stores it under "thumbs/<key>",
// and returns the thumbnail's public URL. The original is never modified.
export async function makeThumbnail(key: string): Promise<string> {
  const original = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const bytes = await original.Body!.transformToByteArray()

  const thumb = await sharp(Buffer.from(bytes))
    .rotate() // honour the photo's EXIF orientation so thumbnails aren't sideways
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
