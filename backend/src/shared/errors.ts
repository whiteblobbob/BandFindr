export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function missing(message = "Data tidak ditemukan."): never {
  throw new ApiError(404, "NOT_FOUND", message);
}
export function forbidden(): never {
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Anda tidak memiliki izin untuk tindakan ini.",
  );
}
export function invalid(message: string): never {
  throw new ApiError(400, "INVALID_REQUEST", message);
}
export function conflict(message: string): never {
  throw new ApiError(409, "CONFLICT", message);
}
export function errorResponse(error: unknown, code: string) {
  if (error instanceof ApiError)
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  const databaseError = error as { code?: string; cause?: { code?: string } };
  const databaseCode = databaseError?.cause?.code ?? databaseError?.code;
  if (databaseCode === "23505")
    return {
      status: 409,
      body: {
        error: { code: "CONFLICT", message: "Data tersebut sudah ada." },
      },
    };
  if (["23503", "23514", "22007", "22008"].includes(databaseCode ?? ""))
    return {
      status: 400,
      body: {
        error: {
          code: "INVALID_REQUEST",
          message: "Data yang dikirim tidak valid.",
        },
      },
    };
  if (["VALIDATION", "PARSE", "INVALID_FILE_TYPE"].includes(code))
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION",
          message: "Periksa kembali data yang dikirim.",
        },
      },
    };
  if (code === "NOT_FOUND")
    return {
      status: 404,
      body: {
        error: { code: "NOT_FOUND", message: "Alamat tidak ditemukan." },
      },
    };
  console.error("Request failed", error);
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Terjadi kesalahan. Silakan coba lagi.",
      },
    },
  };
}
