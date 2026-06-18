#!/bin/bash
set -euo pipefail

awslocal sqs create-queue --queue-name ploot-publish-dlq --region eu-central-1
DLQ_URL=$(awslocal sqs get-queue-url --queue-name ploot-publish-dlq --region eu-central-1 --query 'QueueUrl' --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue \
  --queue-name ploot-publish-jobs \
  --region eu-central-1 \
  --attributes "{
    \"VisibilityTimeout\": \"300\",
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"
  }"

echo "SQS queues ready in LocalStack (eu-central-1)"
