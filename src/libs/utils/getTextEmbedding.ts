import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const BEDROCK_EMBEDDING_MODEL_ID = process.env.BEDROCK_EMBEDDING_MODEL_ID!;
const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

export async function getTextEmbedding(text: string): Promise<number[]> {
  const params = {
    modelId: BEDROCK_EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "*/*",
    body: JSON.stringify({
      inputText: text,
    }),
  };

  try {
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    if (responseBody.embedding && Array.isArray(responseBody.embedding)) {
      return responseBody.embedding;
    } else {
      console.error("Unexpected embedding response format:", responseBody);
      throw new Error(
        "Failed to get embedding or embedding format is incorrect."
      );
    }
  } catch (error) {
    console.error("Error getting embedding from Bedrock:", error);
    throw error;
  }
}
