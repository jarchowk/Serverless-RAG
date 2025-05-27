export const zodErrorHandler = () => ({
  onError: (request: any) => {
    if (request.error.name === "ZodError") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Validation failed",
          errors: request.error.errors,
        }),
      };
    }
    throw request.error;
  },
});
