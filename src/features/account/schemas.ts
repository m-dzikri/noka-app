import { z } from "zod";

export const validCycleStartDays = [
  ...Array.from({ length: 28 }, (_, i) => String(i + 1)),
  "end_of_month",
] as const;

export type ValidCycleStartDay = (typeof validCycleStartDays)[number];

export function isValidCycleStartDay(value: unknown): value is ValidCycleStartDay {
  return (
    typeof value === "string" &&
    validCycleStartDays.includes(value as ValidCycleStartDay)
  );
}

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Nama tidak boleh kosong")
      .max(120, "Nama maksimal 120 karakter")
      .optional(),
    locale: z.enum(["id", "en"]).optional(),
    theme: z.enum(["light", "dark"]).optional(),
    cycleStartDay: z
      .string()
      .refine(isValidCycleStartDay, {
        message: "INVALID_CYCLE_DAY",
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.locale !== undefined ||
      data.theme !== undefined ||
      data.cycleStartDay !== undefined,
    {
      message: "Atribut pembaruan profil tidak boleh kosong",
    },
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
  newPassword: z
    .string()
    .min(8, "Password baru minimal 8 karakter")
    .max(128, "Password baru maksimal 128 karakter"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password konfirmasi wajib diisi"),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

