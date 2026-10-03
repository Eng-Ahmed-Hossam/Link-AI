#!/bin/sh
# Start Moto, create the local resources, then mark the container ready for the healthcheck.
set -eu
rm -f /tmp/link-ready
moto_server -H 0.0.0.0 -p 4566 &
SERVER=$!
python /link/init.py
touch /tmp/link-ready
wait "$SERVER"
