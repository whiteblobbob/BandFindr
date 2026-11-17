import { v2 as cloudinary } from "cloudinary";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, bands } from "../db/schema";
import { config } from "./config";
import { ApiError, missing, invalid } from "./errors";
import { lockBand } from "../band/transactions";

export async function validateImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = Buffer.from(bytes.subarray(0, 8)).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const webp =
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
  if (
    !bytes.length ||
    bytes.length > 5 * 1024 * 1024 ||
    !(
      (file.type === "image/jpeg" && jpeg) ||
      (file.type === "image/png" && png) ||
      (file.type === "image/webp" && webp)
    )
  )
    invalid("Gunakan gambar JPEG, PNG, atau WebP berukuran maksimal 5 MB.");
  return Buffer.from(bytes);
}
async function upload(file: File) {
  const bytes = await validateImage(file);
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  )
    throw new ApiError(
      503,
      "UPLOAD_UNAVAILABLE",
      "Layanan gambar belum tersedia.",
    );
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  try {
    return await cloudinary.uploader.upload(
      `data:${file.type};base64,${bytes.toString("base64")}`,
      {
        folder: config.cloudinaryFolder,
        resource_type: "image",
        allowed_formats: ["jpg", "png", "webp"],
        timeout: 30000,
      },
    );
  } catch {
    throw new ApiError(
      502,
      "UPLOAD_FAILED",
      "Gambar gagal diunggah. Silakan coba lagi.",
    );
  }
}
async function cleanup(publicId: string | null) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    // shortcut: cleanup failures are logged, add a retry queue when automated recovery is required.
    console.error("Cloudinary cleanup failed", publicId, error);
  }
}
export async function uploadProfileImage(userId: string, file: File) {
  const image = await upload(file);
  let previous: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) return missing("Pengguna tidak ditemukan.");
      previous = user.profilePublicId;
      await tx
        .update(users)
        .set({ profilePublicId: image.public_id })
        .where(eq(users.id, userId));
    });
  } catch (error) {
    await cleanup(image.public_id);
    throw error;
  }
  await cleanup(previous);
  return { profile_public_id: image.public_id };
}
export async function uploadBandImage(
  bandId: string,
  userId: string,
  file: File,
) {
  await db.transaction((tx) => lockBand(tx, bandId, userId));
  const image = await upload(file);
  let previous: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const band = await lockBand(tx, bandId, userId);
      previous = band.logoPublicId;
      await tx
        .update(bands)
        .set({ logoPublicId: image.public_id })
        .where(eq(bands.id, bandId));
    });
  } catch (error) {
    await cleanup(image.public_id);
    throw error;
  }
  await cleanup(previous);
  return { logo_public_id: image.public_id };
}
