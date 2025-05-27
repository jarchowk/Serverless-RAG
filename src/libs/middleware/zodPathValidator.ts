import { z } from "zod";

export const zodPathValidator = (schema: z.ZodTypeAny) => ({
  before: async (request: any) => {
    try {
      console.log(
        "Path parameters before validation:",
        request.event.pathParameters
      );
      request.event.validatedPath = schema.parse(request.event.pathParameters);
    } catch (error) {
      console.error("Validation failed in zodValidator:", error);
      throw error;
    }
  },
});
