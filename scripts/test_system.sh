#!/bin/bash

echo "=== Distributed File Processing System - Quick Start ==="
echo ""

# Generate test data
echo "1. Generating test data (100k rows)..."
python scripts/generate_test_data.py 100000 test_data.csv

# Upload file
echo ""
echo "2. Uploading file..."
RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/upload" \
  -F "file=@test_data.csv" \
  -F "operation=sum" \
  -F "column=amount" \
  -F "chunk_size_rows=25000")

echo $RESPONSE
JOB_ID=$(echo $RESPONSE | grep -oP '(?<="job_id":")[^"]*')

echo ""
echo "Job ID: $JOB_ID"

# Start processing
echo ""
echo "3. Starting processing..."
curl -s -X POST "http://localhost:8000/api/v1/process/$JOB_ID"

# Check status
echo ""
echo ""
echo "4. Checking status (waiting 5 seconds)..."
sleep 5
curl -s "http://localhost:8000/api/v1/status/$JOB_ID" | python -m json.tool

# Get result
echo ""
echo ""
echo "5. Getting result (waiting 5 more seconds)..."
sleep 5
curl -s "http://localhost:8000/api/v1/result/$JOB_ID" | python -m json.tool

echo ""
echo ""
echo "=== Test Complete ==="
echo "Ray Dashboard: http://localhost:8265"
echo "API Docs: http://localhost:8000/docs"
