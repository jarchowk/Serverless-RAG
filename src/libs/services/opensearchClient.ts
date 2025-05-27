import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

const OPENSEARCH_COLLECTION_ENDPOINT =
  process.env.OPENSEARCH_COLLECTION_ENDPOINT!;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

export const openSearchClient = new Client({
  ...AwsSigv4Signer({
    region: AWS_REGION,
    service: "aoss",
    getCredentials: () => {
      const credentialsProvider = defaultProvider();
      return credentialsProvider();
    },
  }),
  node: `https://${OPENSEARCH_COLLECTION_ENDPOINT}`,
});
