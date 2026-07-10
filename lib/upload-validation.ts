export type UploadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const defaultMaxUploadMb = 150;

function configuredMaxUploadBytes() {
  const configured = Number(process.env.DG_MAX_UPLOAD_MB || defaultMaxUploadMb);
  const maxMb = Number.isFinite(configured) && configured > 0 ? configured : defaultMaxUploadMb;
  return maxMb * 1024 * 1024;
}

export function validateUploadedFile(
  file: File,
  options: {
    allowedExtensions: string[];
    label: string;
  },
): UploadValidationResult {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const allowed = options.allowedExtensions.map((value) =>
    value.replace(/^\./, "").toLowerCase(),
  );

  if (!allowed.includes(extension)) {
    return {
      ok: false,
      message: `${options.label} debe ser ${allowed.map((value) => `.${value}`).join(", ")}.`,
    };
  }

  const maxBytes = configuredMaxUploadBytes();
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `${options.label} supera el máximo permitido de ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      message: `${options.label} está vacío.`,
    };
  }

  return { ok: true };
}
