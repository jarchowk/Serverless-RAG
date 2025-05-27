import { handlerPath } from "@libs/handler-resolver";

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  role: "QueryRAGRole",
  timeout: 60,
  memorySize: 256,
  events: [
    {
      httpApi: {
        // Using HTTP API (newer, cheaper, faster)
        path: "/query",
        method: "post",
      },
    },
    // If you prefer REST API (like your current setup):
    // {
    //   http: {
    //     path: "query",
    //     method: "post",
    //     cors: true,
    //   }
    // }
  ],
};
