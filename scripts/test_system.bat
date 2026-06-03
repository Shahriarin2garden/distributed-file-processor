@echo off
echo === Distributed File Processing System - Quick Start ===
echo.

REM Generate test data
echo 1. Generating test data (100k rows)...
python scripts\generate_test_data.py 100000 test_data.csv

REM Upload file
echo.
echo 2. Uploading file...
curl -X POST "http://localhost:8000/api/v1/upload" -F "file=@test_data.csv" -F "operation=sum" -F "column=amount" -F "chunk_size_rows=25000" > temp_response.json
type temp_response.json

REM Extract job_id (requires jq or manual copy)
echo.
echo Please copy the job_id from above and paste it below:
set /p JOB_ID="Job ID: "

REM Start processing
echo.
echo 3. Starting processing...
curl -X POST "http://localhost:8000/api/v1/process/%JOB_ID%"

REM Check status
echo.
echo.
echo 4. Checking status (waiting 5 seconds)...
timeout /t 5 /nobreak > nul
curl "http://localhost:8000/api/v1/status/%JOB_ID%"

REM Get result
echo.
echo.
echo 5. Getting result (waiting 5 more seconds)...
timeout /t 5 /nobreak > nul
curl "http://localhost:8000/api/v1/result/%JOB_ID%"

echo.
echo.
echo === Test Complete ===
echo Ray Dashboard: http://localhost:8265
echo API Docs: http://localhost:8000/docs

del temp_response.json
pause
