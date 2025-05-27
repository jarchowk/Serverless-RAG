import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const OPENSEARCH_INDEX_NAME = process.env.OPENSEARCH_INDEX_NAME!;
const OPENSEARCH_COLLECTION_ENDPOINT =
  process.env.OPENSEARCH_COLLECTION_ENDPOINT!;

//TODO: Abstract service
const openSearchClient = new Client({
  ...AwsSigv4Signer({
    region: AWS_REGION,
    service: "aoss",
    getCredentials: () => {
      // Use default credential provider (picks up IAM role from Lambda)
      const credentialsProvider = defaultProvider();
      return credentialsProvider();
    },
  }),
  node: `https://${OPENSEARCH_COLLECTION_ENDPOINT}`,
});

export async function ensureIndexExists() {
  try {
    const indexExists = await openSearchClient.indices.exists({
      index: OPENSEARCH_INDEX_NAME,
    });
    // The `body` property in the response from `indices.exists` indicates existence
    // It returns a boolean (true if exists, false if not) in the `body` for v8.x of the client.
    // For older versions, it might throw a 404 if it doesn't exist.
    // Let's assume modern client behavior:
    if (indexExists.body) {
      console.log(`Index "${OPENSEARCH_INDEX_NAME}" already exists.`);
      return;
    }

    console.log(`Index "${OPENSEARCH_INDEX_NAME}" does not exist. Creating...`);
    // Define the mapping for the index, especially for the vector field
    // Dimensions will depend on your embedding model (e.g., Titan Embeddings G1 - Text: 1536)
    // Claude embeddings might have different dimensions. Check model documentation.
    // amazon.titan-embed-text-v1: 1536 dimensions
    const titanEmbeddingDim = 1536;
    await openSearchClient.indices.create({
      index: OPENSEARCH_INDEX_NAME,
      body: {
        settings: {
          "index.knn": true, // Enable k-NN search for the index
          "index.knn.space_type": "cosinesimil", // Or l2, innerproduct
        },
        mappings: {
          properties: {
            embedding_vector: {
              type: "knn_vector",
              dimension: titanEmbeddingDim, // IMPORTANT: Match embedding model's dimension
              method: {
                name: "hnsw",
                space_type: "cosinesimil", // Should match index.knn.space_type if set
                engine: "nmslib", // or "faiss" if supported and preferred
                parameters: {
                  ef_construction: 256,
                  m: 48,
                },
              },
            },
            text_chunk: { type: "text" },
            source_document_s3_key: { type: "keyword" }, // For traceability
          },
        },
      },
    });
    console.log(`Index "${OPENSEARCH_INDEX_NAME}" created successfully.`);
  } catch (error: any) {
    // If it's a 404 for .exists, it means it doesn't exist, which is fine.
    // The create call might fail for other reasons (e.g. permissions, already exists with different settings)
    if (
      error.statusCode === 404 &&
      error.message.includes("index_not_found_exception")
    ) {
      console.log(
        `Index "${OPENSEARCH_INDEX_NAME}" does not exist. Proceeding to create...`
      );
      // The create call will happen, this was just for the exists check.
    } else if (
      error.message &&
      error.message.includes("resource_already_exists_exception")
    ) {
      console.log(
        `Index "${OPENSEARCH_INDEX_NAME}" already exists (caught creation error).`
      );
      return;
    } else {
      console.error(
        `Error in ensureIndexExists for index "${OPENSEARCH_INDEX_NAME}":`,
        error
      );
      throw error;
    }
  }
}
