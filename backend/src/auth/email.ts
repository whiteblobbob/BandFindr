import { config } from "../shared/config";
import { ApiError } from "../shared/errors";

export async function sendRegistrationCode(email: string, code: string) {
  if (!config.resendApiKey || !config.resendFromEmail)
    throw new ApiError(
      503,
      "EMAIL_UNAVAILABLE",
      "Pengiriman kode sementara tidak tersedia.",
    );
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.resendFromEmail,
        to: [email],
        subject: "Kode pendaftaran BandFindr",
        text: `Kode pendaftaran Anda: ${code}. Kode berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  } catch {
    throw new ApiError(
      503,
      "EMAIL_UNAVAILABLE",
      "Kode gagal dikirim. Silakan coba lagi.",
    );
  }
}
