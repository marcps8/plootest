terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "environment" {
  type    = string
  default = "production"
}

resource "aws_sqs_queue" "publish_dlq" {
  name                      = "ploot-publish-dlq-${var.environment}"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled     = true
}

resource "aws_sqs_queue" "publish_jobs" {
  name                       = "ploot-publish-jobs-${var.environment}"
  visibility_timeout_seconds = 300
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.publish_dlq.arn
    maxReceiveCount     = 5
  })
}

output "publish_queue_url" {
  value = aws_sqs_queue.publish_jobs.url
}

output "publish_dlq_url" {
  value = aws_sqs_queue.publish_dlq.url
}
