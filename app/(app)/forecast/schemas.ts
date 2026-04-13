import { z } from 'zod'

export const UpdateLineAmountsSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        amount: z.coerce.number(),
      }),
    )
    .min(1)
    .max(500),
})
