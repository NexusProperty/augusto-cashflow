import { z } from 'zod'

export const AMOUNT_MIN = -1_000_000_000
export const AMOUNT_MAX = 1_000_000_000

export const UpdateLineAmountsSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        amount: z.coerce.number().min(AMOUNT_MIN).max(AMOUNT_MAX),
      }),
    )
    .min(1)
    .max(500),
})
