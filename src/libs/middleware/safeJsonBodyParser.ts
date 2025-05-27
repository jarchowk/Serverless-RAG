export const safeJsonBodyParser = () => ({
  before: async (request: any) => {
    if (typeof request.event.body === "string") {
      try {
        request.event.body = JSON.parse(request.event.body);
      } catch {
        throw new Error("Invalid JSON body");
      }
    }
  },
});
