import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const convert = (await import("heic-convert")).default;
    const outputBuffer = await convert({
      buffer: Buffer.from(arrayBuffer),
      format: "JPEG",
      quality: 0.9,
    });
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
      },
    });
  } catch (err) {
    console.error("API convert HEIC failed", err);
    return NextResponse.json({ error: "convert_failed" }, { status: 500 });
  }
}
