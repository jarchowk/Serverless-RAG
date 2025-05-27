# Serverless RAG API Service

This project provides a **serverless Retrieval-Augmented Generation (RAG) API** on AWS, using Lambda, S3, and OpenSearch Serverless. It enables document ingestion and semantic search with Bedrock embeddings and LLMs.

---

## Features

- **Document Ingestion:** Upload documents (PDF, TXT) to S3 and process them via Lambda.
- **Vector Storage:** Store and search document embeddings in OpenSearch Serverless.
- **Semantic Search:** Query documents using Bedrock embeddings and LLMs.
- **Serverless Architecture:** Fully managed, scalable, and cost-effective.

---

## Architecture

- **AWS Lambda:** Handles document processing and query requests.
- **Amazon S3:** Stores source documents.
- **OpenSearch Serverless:** Stores and searches vector embeddings.
- **Amazon Bedrock:** Provides embedding and LLM models.
- **IAM Roles & Policies:** Secure, least-privilege access for all resources.

---

## Deployment

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Serverless Framework v3+](https://www.serverless.com/)
- AWS CLI configured with appropriate permissions

### Install Dependencies

```bash
npm install
```

### Deploy

```bash
npx serverless deploy --stage dev
```

---

## Environment Variables

These are set automatically by the Serverless Framework:

- `DOCUMENTS_BUCKET_NAME` — S3 bucket for documents
- `OPENSEARCH_COLLECTION_ENDPOINT` — OpenSearch Serverless endpoint
- `OPENSEARCH_INDEX_NAME` — OpenSearch index name (default: `my-rag-index`)
- `BEDROCK_EMBEDDING_MODEL_ID` — Bedrock embedding model (default: `amazon.titan-embed-text-v1`)
- `BEDROCK_LLM_MODEL_ID` — Bedrock LLM model (default: `anthropic.claude-3-sonnet-20240229-v1:0`)

---

## API Endpoints

- **Document Processing:** Triggered by S3 upload events.
- **Query Endpoint:**
  ```
  https://<api-id>.execute-api.<region>.amazonaws.com/query
  ```
  (See CloudFormation Outputs after deployment.)

---

## Project Structure

```
src/
  functions/
    process/
      handler.ts        # Lambda for processing documents
    query/
      handler.ts        # Lambda for querying RAG
  services/
    opensearchClient.ts # OpenSearch client initialization
  libs/
    utils/              # Utility functions (chunking, embedding, etc.)
serverless.ts           # Infrastructure as code (Serverless Framework)
```

---

## Outputs

After deployment, CloudFormation will output:

- S3 bucket name
- OpenSearch collection endpoint and ARN
- API Gateway endpoint for queries

---

## Security Notes

- S3 CORS is open for development; restrict in production.
- OpenSearch network policy allows public access for API Gateway/Lambda; use VPC endpoints for production.
- IAM roles are scoped for least privilege.

---

## License

MIT

---

## Authors

- [Your Name or Team]

---

## References

- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
-
