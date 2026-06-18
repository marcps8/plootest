import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from "@aws-sdk/client-sqs";

export interface PublishMessage {
  postId: string;
  profileId: string;
  traceId?: string;
}

function client(): SQSClient {
  const region = process.env.AWS_REGION ?? "eu-central-1";
  const endpoint = process.env.AWS_ENDPOINT_URL;
  return new SQSClient({
    region,
    ...(endpoint ? { endpoint } : {}),
    credentials: endpoint
      ? { accessKeyId: "test", secretAccessKey: "test" }
      : undefined,
  });
}

function queueUrl(): string {
  const url = process.env.SQS_QUEUE_URL;
  if (!url) {
    throw new Error("SQS_QUEUE_URL is not configured");
  }
  return url;
}

export function isSqsEnabled(): boolean {
  return Boolean(process.env.SQS_QUEUE_URL);
}

export async function enqueuePublish(
  message: PublishMessage,
  delaySeconds = 0
): Promise<void> {
  await client().send(
    new SendMessageCommand({
      QueueUrl: queueUrl(),
      MessageBody: JSON.stringify(message),
      DelaySeconds: Math.min(Math.max(delaySeconds, 0), 900),
      MessageAttributes: {
        traceId: {
          DataType: "String",
          StringValue: message.traceId ?? "none",
        },
      },
    })
  );
}

export function parsePublishMessage(msg: Message): PublishMessage | null {
  if (!msg.Body) return null;
  try {
    return JSON.parse(msg.Body) as PublishMessage;
  } catch {
    return null;
  }
}

export async function receivePublishMessages(maxMessages = 10): Promise<Message[]> {
  const res = await client().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl(),
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20,
      MessageAttributeNames: ["All"],
      MessageSystemAttributeNames: ["ApproximateReceiveCount"],
    })
  );
  return res.Messages ?? [];
}

export async function deletePublishMessage(receiptHandle: string): Promise<void> {
  await client().send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl(),
      ReceiptHandle: receiptHandle,
    })
  );
}

export function receiveCount(msg: Message): number {
  return Number(msg.Attributes?.ApproximateReceiveCount ?? 1);
}
