# Local AWS stand-in: Moto server (Apache-2.0) — S3, SNS, SQS, KMS, Secrets Manager.
# Replaces LocalStack, whose current image refuses to start without an account token
# (ADR-0006). Moto keeps state in memory, so `init.py` recreates everything on each start.
FROM motoserver/moto:latest

COPY init.py entrypoint.sh /link/
RUN chmod +x /link/entrypoint.sh

ENTRYPOINT ["/link/entrypoint.sh"]
