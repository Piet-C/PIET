import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextResponse } from "next/server"
import { r2, BUCKET } from "@/lib/r2"

export async function POST(request: Request) {
  const { fileName, contentType } = await request.json()
  const key = `${Date.now()}_${fileName}`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 })

  return NextResponse.json({
    signedUrl,
    key,
    publicUrl: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`,
  })
}
