import type { AWS } from "@serverless/typescript";
import { process, query } from "./src/functions/index";

const serverlessConfiguration: AWS = {
  service: "rag-api-service",
  frameworkVersion: "4",
  provider: {
    name: "aws",
    runtime: "nodejs22.x", // TODO: Ensure Bedrock SDKs and OpenSearch clients work well
    region: "us-east-1",
    tracing: {
      lambda: true,
    },
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      NODE_OPTIONS: "--enable-source-maps --stack-trace-limit=1000",
      DOCUMENTS_BUCKET_NAME: { Ref: "DocumentsS3Bucket" },
      OPENSEARCH_COLLECTION_ENDPOINT: {
        "Fn::GetAtt": ["RAGVectorCollection", "CollectionEndpoint"],
      },
      OPENSEARCH_INDEX_NAME: "my-rag-index",
      BEDROCK_EMBEDDING_MODEL_ID: "amazon.titan-embed-text-v1",
      BEDROCK_LLM_MODEL_ID: "anthropic.claude-3-sonnet-20240229-v1:0",
    },
    // Global IAM statement
    // iam: {
    //   role: {
    //     statements: [
    //       {
    //         Effect: "Allow",
    //         Action: [
    //           "logs:CreateLogGroup",
    //           "logs:CreateLogStream",
    //           "logs:PutLogEvents",
    //           "xray:PutTraceSegments",
    //           "xray:PutTelemetryRecords",
    //         ],
    //         Resource: "*",
    //       },
    //     ],
    //   },
    // },
  },
  functions: {
    processDocument: {
      ...process,
    },
    queryRAG: {
      ...query,
    },
  },
  package: { individually: true },
  custom: {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ["@aws-sdk"],
      target: "node22",
      define: { "require.resolve": undefined },
      platform: "node",
      concurrency: 10,
      packager: "npm",
    },
    // OpenSearch Serverless local emulation is not straightforward with a plugin like serverless-dynamodb.
    // For local testing, you might mock the OpenSearch client or use a local OpenSearch Docker container (not serverless version).
  },
  resources: {
    Resources: {
      DocumentsS3Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "${self:service}-documents-${sls:stage}-${aws:accountId}", // Ensure unique name
          CorsConfiguration: {
            CorsRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
                AllowedOrigins: ["*"], //TODO: Restrict this in production
                MaxAge: 3000,
              },
            ],
          },
          // PublicAccessBlockConfiguration: {
          //   BlockPublicAcls: true,
          //   BlockPublicPolicy: true,
          //   IgnorePublicAcls: true,
          //   RestrictPublicBuckets: true,
          // },
        },
      },

      // --- New OpenSearch Serverless Collection for RAG ---
      RAGVectorCollection: {
        Type: "AWS::OpenSearchServerless::Collection",
        Properties: {
          Name: "${self:service}-rag-vectors-${sls:stage}",
          Type: "VECTORSEARCH",
          Description: "Vector search collection for RAG",
          // StandbyReplicas: "DISABLED", // For dev/test to save costs
        },
        DependsOn: ["RAGCollectionEncryptionPolicy"],
      },
      // Encryption policy for the collection (uses AWS owned key by default if not specified)
      RAGCollectionEncryptionPolicy: {
        Type: "AWS::OpenSearchServerless::SecurityPolicy",
        Properties: {
          Name: "${self:service}-enc-${sls:stage}",
          Type: "encryption",
          Policy: {
            "Fn::Sub":
              '{"Rules":[{"ResourceType":"collection","Resource":["collection/${self:service}-rag-vectors-${sls:stage}"]}],"AWSOwnedKey":true}',
          },
        },
      },
      // Network policy for the collection (allow public access from internet for API gateway/lambda)
      RAGCollectionNetworkPolicy: {
        Type: "AWS::OpenSearchServerless::SecurityPolicy",
        Properties: {
          Name: "${self:service}-network-${sls:stage}",
          Type: "network",
          Policy: {
            "Fn::Sub":
              '[{"Rules":[{"ResourceType":"collection","Resource":["collection/${self:service}-rag-vectors-${sls:stage}"]},{"ResourceType":"dashboard","Resource":["collection/${self:service}-rag-vectors-${sls:stage}"]}],"AllowFromPublic":true}]',
          },
        },
      },
      // Data Access Policy for OpenSearch Serverless Collection
      RAGCollectionDataAccessPolicy: {
        Type: "AWS::OpenSearchServerless::AccessPolicy",
        Properties: {
          Name: "${self:service}-data-${sls:stage}",
          Type: "data",
          Description: "Data access policy for RAG Lambda functions",
          Policy: {
            "Fn::Sub": [
              `[
                {
                  "Rules": [
                    {
                      "ResourceType": "collection",
                      "Resource": ["collection/\${CollectionName}"],
                      "Permission": ["aoss:DescribeCollectionItems"]
                    },
                    {
                      "ResourceType": "index",
                      "Resource": ["index/\${CollectionName}/*"],
                      "Permission": [
                        "aoss:CreateIndex",
                        "aoss:DeleteIndex",
                        "aoss:UpdateIndex",
                        "aoss:DescribeIndex",
                        "aoss:ReadDocument",
                        "aoss:WriteDocument"
                      ]
                    }
                  ],
                  "Principal": [
                    "\${ProcessDocumentRoleArn}",
                    "\${QueryRAGRoleArn}"
                  ]
                }
              ]`,
              {
                CollectionName: "${self:service}-rag-vectors-${sls:stage}",
                ProcessDocumentRoleArn: {
                  "Fn::GetAtt": ["ProcessDocumentRole", "Arn"],
                },
                QueryRAGRoleArn: { "Fn::GetAtt": ["QueryRAGRole", "Arn"] },
              },
            ],
          },
        },
        DependsOn: [
          "RAGVectorCollection",
          "ProcessDocumentRole",
          "QueryRAGRole",
        ],
      },

      // --- New IAM Roles for RAG Lambdas ---
      ProcessDocumentRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "${self:service}-process-document-role-${sls:stage}",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName:
                "${self:service}-process-document-policy-${sls:stage}",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    // Basic Lambda permissions
                    Effect: "Allow",
                    Action: [
                      "logs:CreateLogGroup",
                      "logs:CreateLogStream",
                      "logs:PutLogEvents",
                    ],
                    Resource:
                      "arn:aws:logs:${aws:region}:${aws:accountId}:log-group:/aws/lambda/${self:service}-${sls:stage}-processDocument:*",
                  },
                  {
                    // X-Ray permissions
                    Effect: "Allow",
                    Action: [
                      "xray:PutTraceSegments",
                      "xray:PutTelemetryRecords",
                    ],
                    Resource: "*",
                  },
                  {
                    // S3 Read permissions for the documents bucket
                    Effect: "Allow",
                    Action: ["s3:GetObject"],
                    Resource: {
                      "Fn::Sub": "arn:aws:s3:::${DocumentsS3Bucket}/*",
                    },
                  },
                  {
                    // Bedrock Invoke Model for embeddings
                    Effect: "Allow",
                    Action: "bedrock:InvokeModel",
                    Resource: {
                      "Fn::Sub":
                        "arn:aws:bedrock:${aws:region}::foundation-model/${self:provider.environment.BEDROCK_EMBEDDING_MODEL_ID}",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      QueryRAGRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "${self:service}-query-rag-role-${sls:stage}",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "${self:service}-query-rag-policy-${sls:stage}",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    // Basic Lambda permissions
                    Effect: "Allow",
                    Action: [
                      "logs:CreateLogGroup",
                      "logs:CreateLogStream",
                      "logs:PutLogEvents",
                    ],
                    Resource:
                      "arn:aws:logs:${aws:region}:${aws:accountId}:log-group:/aws/lambda/${self:service}-${sls:stage}-queryRAG:*",
                  },
                  {
                    // X-Ray permissions
                    Effect: "Allow",
                    Action: [
                      "xray:PutTraceSegments",
                      "xray:PutTelemetryRecords",
                    ],
                    Resource: "*",
                  },
                  {
                    // Bedrock Invoke Model for embeddings (query) and generation (LLM)
                    Effect: "Allow",
                    Action: "bedrock:InvokeModel",
                    Resource: [
                      {
                        "Fn::Sub":
                          "arn:aws:bedrock:${aws:region}::foundation-model/${self:provider.environment.BEDROCK_EMBEDDING_MODEL_ID}",
                      },
                      {
                        "Fn::Sub":
                          "arn:aws:bedrock:${aws:region}::foundation-model/${self:provider.environment.BEDROCK_LLM_MODEL_ID}",
                      },
                    ],
                  },
                  // OpenSearch Serverless permissions are granted via Data Access Policy
                ],
              },
            },
          ],
        },
      },
    },
    Outputs: {
      // Optional: if you want to easily see these values after deployment
      DocumentsS3BucketName: {
        Description: "Name of the S3 bucket for documents",
        Value: { Ref: "DocumentsS3Bucket" },
      },
      OpenSearchCollectionEndpoint: {
        Description: "Endpoint for the OpenSearch Serverless collection",
        Value: { "Fn::GetAtt": ["RAGVectorCollection", "CollectionEndpoint"] },
      },
      OpenSearchCollectionARN: {
        Description: "ARN of the OpenSearch Serverless collection",
        Value: { "Fn::GetAtt": ["RAGVectorCollection", "Arn"] },
      },
      RAGApiEndpoint: {
        Description: "API Gateway endpoint for the RAG query function",
        Value: {
          "Fn::Sub":
            "https://${HttpApi}.execute-api.${aws:region}.amazonaws.com/query",
        },
        Export: {
          Name: "${self:service}-${sls:stage}-RAGApiEndpoint",
        },
      },
    },
  },
};

module.exports = serverlessConfiguration;
