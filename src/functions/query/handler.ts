import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getTextEmbedding } from "@libs/utils/getTextEmbedding";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { openSearchClient } from "@libs/services/opensearchClient";

// Environment Variables (ensure these are set in serverless.yml)
process.env.OPENSEARCH_COLLECTION_ENDPOINT!;
const OPENSEARCH_INDEX_NAME = process.env.OPENSEARCH_INDEX_NAME!;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const BEDROCK_LLM_MODEL_ID = process.env.BEDROCK_LLM_MODEL_ID!;

const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("QueryRAG event:", JSON.stringify(event, null, 2));

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing request body" }),
    };
  }

  let requestBody;
  try {
    requestBody = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON in request body" }),
    };
  }

  const userQuery = requestBody.query;
  const topK = requestBody.topK || 3; // How many relevant chunks to retrieve

  if (!userQuery || typeof userQuery !== "string") {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Missing or invalid "query" in request body',
      }),
    };
  }

  try {
    console.log(`Generating embedding for query: "${userQuery}"`);
    const queryEmbedding = await getTextEmbedding(userQuery);

    console.log(
      `Searching OpenSearch index "${OPENSEARCH_INDEX_NAME}" for relevant documents.`
    );
    const searchResponse = await openSearchClient.search({
      index: OPENSEARCH_INDEX_NAME,
      body: {
        size: topK, // Number of results to return
        _source: ["text_chunk", "source_document_s3_key"], // Specify fields to retrieve
        query: {
          knn: {
            embedding_vector: {
              // Field name in your OpenSearch index
              vector: queryEmbedding,
              k: topK,
            },
          },
        },
      },
    });

    // @ts-ignore - OpenSearch client types might not be perfect for response structure
    const hits = searchResponse.body?.hits?.hits || [];
    if (hits.length === 0) {
      console.log("No relevant documents found in OpenSearch.");
      // Fallback: could respond with "I don't know" or try LLM without context
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            "I couldn't find any relevant information to answer your question.",
          sources: [],
        }),
      };
    }

    const contextChunks = hits.map((hit: any) => hit._source.text_chunk);
    const sources = hits.map((hit: any) => ({
      s3_key: hit._source.source_document_s3_key,
      score: hit._score, // relevance score from OpenSearch
    }));

    const context = contextChunks.join("\n\n---\n\n"); // Combine chunks into a single context string
    console.log(`Retrieved context from ${hits.length} chunks.`);
    // console.log("Context:\n", context); // Be careful logging large contexts

    // Construct prompt for the LLM (example for Anthropic Claude)
    // Adjust prompt engineering based on the chosen LLM
    const prompt = `Human: You are a helpful AI assistant. Based on the following CONTEXT, please answer the QUESTION.
If the context does not provide enough information, say "I don't have enough information in the provided documents to answer that."

CONTEXT:
${context}

QUESTION:
${userQuery}

Assistant:`;

    console.log("Invoking Bedrock LLM...");
    const llmParams = {
      modelId: BEDROCK_LLM_MODEL_ID,
      contentType: "application/json",
      accept: "*/*",
      body: JSON.stringify({
        prompt: prompt,
        max_tokens_to_sample: 500, // Adjust as needed
        temperature: 0.7, // Adjust for creativity vs. factuality
        // top_p: 0.9, // Adjust as needed
      }),
    };

    const llmCommand = new InvokeModelCommand(llmParams);
    const llmResponse = await bedrockClient.send(llmCommand);
    const llmResponseBody = JSON.parse(
      new TextDecoder().decode(llmResponse.body)
    );

    // The actual response field depends on the model (e.g., "completion" for Claude, "outputText" for Titan Text)
    // For Claude (e.g., anthropic.claude-v2 or claude-3-sonnet)
    const answer =
      llmResponseBody.completion ||
      llmResponseBody.generations?.[0]?.text ||
      "No answer generated.";
    // For Amazon Titan Text (e.g., amazon.titan-text-express-v1)
    // const answer = llmResponseBody.results?.[0]?.outputText || "No answer generated.";

    console.log("LLM Answer:", answer);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: answer.trim(),
        sources: sources,
      }),
    };
  } catch (error: any) {
    console.error("Error in queryRAG:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: error.message,
      }),
    };
  }
};
