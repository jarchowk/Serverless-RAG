import { handlerPath } from "@libs/handler-resolver";

export default {
  handler: `${handlerPath(__dirname)}/handler.main`,
  role: "ProcessDocumentRole",
  timeout: 300,
  memorySize: 512,
  events: [
    {
      s3: {
        bucket: { Ref: "DocumentsS3Bucket" },
        event: "s3:ObjectCreated:*",
        existing: true,
        forceDeploy: true,
      },
    },
  ],
};
