import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import * as Stream from "stream";
import pdf from "pdf-parse";
import { ensureIndexExists } from "@libs/utils/ensureIndexExists";
import { streamToString } from "@libs/utils/streamToString";
import { streamToBuffer } from "@libs/utils/streamToBuffer";
import { getTextEmbedding } from "@libs/utils/getTextEmbedding";
import { chunkText } from "@libs/utils/chunkText";
import { openSearchClient } from "@libs/services/opensearchClient";

const DOCUMENTS_BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME!;
const OPENSEARCH_INDEX_NAME = process.env.OPENSEARCH_INDEX_NAME!;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Initialize AWS Clients
const s3Client = new S3Client({ region: AWS_REGION });

export const handler = async (event: S3Event): Promise<void> => {
  console.log("ProcessDocument event:", JSON.stringify(event, null, 2));

  await ensureIndexExists(); // Ensure index exists before processing

  for (const record of event.Records) {
    const bucketName = record.s3.bucket.name;
    const objectKey = decodeURIComponent(
      record.s3.object.key.replace(/\+/g, " ")
    );

    if (bucketName !== DOCUMENTS_BUCKET_NAME) {
      console.warn(`Skipping record from unexpected bucket: ${bucketName}`);
      continue;
    }

    console.log(`Processing document: s3://${bucketName}/${objectKey}`);

    try {
      const getObjectParams = {
        Bucket: bucketName,
        Key: objectKey,
      };
      const s3Object = await s3Client.send(
        new GetObjectCommand(getObjectParams)
      );

      if (!s3Object.Body) {
        throw new Error("S3 object body is empty.");
      }

      let documentText = "";
      if (objectKey.toLowerCase().endsWith(".txt")) {
        documentText = await streamToString(s3Object.Body as Stream.Readable);
      } else if (objectKey.toLowerCase().endsWith(".pdf")) {
        const buffer = await streamToBuffer(s3Object.Body as Stream.Readable);
        const data = await pdf(buffer);
        documentText = data.text;
      } else {
        console.warn(`Unsupported file type for ${objectKey}. Skipping.`);
        continue;
      }

      if (!documentText.trim()) {
        console.log(
          `Document ${objectKey} is empty or contains no extractable text. Skipping.`
        );
        continue;
      }

      const chunks = chunkText(documentText);
      console.log(`Document split into ${chunks.length} chunks.`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk.trim()) continue; // Skip empty chunks

        console.log(`Generating embedding for chunk ${i + 1}/${chunks.length}`);
        const embedding = await getTextEmbedding(chunk);

        const documentToStore = {
          text_chunk: chunk,
          embedding_vector: embedding,
          source_document_s3_key: objectKey,
        };

        // Generate a unique ID for the document in OpenSearch
        // This helps in updating/deleting if needed, and prevents duplicates on re-runs if content is identical
        const docId = `${objectKey}_chunk_${i}`;

        console.log(
          `Indexing chunk ${
            i + 1
          } with ID ${docId} into OpenSearch index: ${OPENSEARCH_INDEX_NAME}`
        );
        await openSearchClient.index({
          index: OPENSEARCH_INDEX_NAME,
          id: docId, // Use a consistent ID
          body: documentToStore,
          refresh: true, // 'true', 'false', or 'wait_for'. For immediate visibility in dev.
        });
        console.log(`Chunk ${i + 1} indexed successfully.`);
      }
      console.log(`Successfully processed and indexed document: ${objectKey}`);
    } catch (error) {
      console.error(`Error processing document ${objectKey}:`, error);
      // Potentially add to a DLQ or re-throw to mark Lambda invocation as failed
    }
  }
};
