import { z } from "zod";

export const zodBodyValidator = (schema: z.ZodTypeAny) => ({
  before: async (request: any) => {
    try {
      request.event.validatedBody = schema.parse(request.event.body);
    } catch (error) {
      console.error("Validation failed in zodValidator:", error);
      throw error;
    }
  },
});
