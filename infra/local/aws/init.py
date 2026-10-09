"""Create the local AWS resources (docs/14 §2): buckets, event topic, one queue + DLQ per
consumer group, KMS keys `storage` and `fields`, and a Secrets Manager secret.

Names follow the env vars in `.env.example`. Consumer groups: one per Phase 1 consumer
(docs/05 §4). Add a group here and in `.env.example` when a new consumer arrives.
"""

import json
import os
import time
import urllib.request

import boto3

ENDPOINT = "http://localhost:4566"
REGION = os.environ.get("AWS_REGION", "eu-central-1")
BUCKETS = ["link-local-voice", "link-local-media", "link-local-exports"]
TOPIC = "link-local-events"
CONSUMERS = ["notifications", "platform-demo", "voice", "messaging", "followup"]


def wait_for_server() -> None:
    for _ in range(60):
        try:
            urllib.request.urlopen(f"{ENDPOINT}/moto-api/", timeout=1)
            return
        except Exception:
            time.sleep(0.5)
    raise SystemExit("moto did not start")


def client(name: str):
    return boto3.client(
        name,
        endpoint_url=ENDPOINT,
        region_name=REGION,
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )


def main() -> None:
    wait_for_server()
    s3 = client("s3")
    for b in BUCKETS:
        s3.create_bucket(Bucket=b, CreateBucketConfiguration={"LocationConstraint": REGION})

    sns, sqs = client("sns"), client("sqs")
    topic_arn = sns.create_topic(Name=TOPIC)["TopicArn"]
    for c in CONSUMERS:
        dlq_url = sqs.create_queue(QueueName=f"link-local-{c}-dlq")["QueueUrl"]
        dlq_arn = sqs.get_queue_attributes(QueueUrl=dlq_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
        q_url = sqs.create_queue(
            QueueName=f"link-local-{c}",
            Attributes={
                "VisibilityTimeout": "30",
                "RedrivePolicy": json.dumps({"deadLetterTargetArn": dlq_arn, "maxReceiveCount": "5"}),
            },
        )["QueueUrl"]
        q_arn = sqs.get_queue_attributes(QueueUrl=q_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
        sns.subscribe(TopicArn=topic_arn, Protocol="sqs", Endpoint=q_arn, Attributes={"RawMessageDelivery": "true"})

    kms = client("kms")
    for alias in ("storage", "fields"):
        key_id = kms.create_key(Description=f"link local {alias} key")["KeyMetadata"]["KeyId"]
        kms.create_alias(AliasName=f"alias/link-local-{alias}", TargetKeyId=key_id)

    client("secretsmanager").create_secret(
        Name="link/local/placeholder",
        SecretString=json.dumps({"note": "local only; real secrets come from the cloud secrets manager"}),
    )
    print(f"aws-local ready: {len(BUCKETS)} buckets, topic {TOPIC}, {len(CONSUMERS)} queues + DLQs, 2 KMS keys")


if __name__ == "__main__":
    main()
