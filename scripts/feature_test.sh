#!/usr/bin/env bash
# Complete feature verification against a live stack on http://localhost:8000
# Usage: bash scripts/feature_test.sh
set -euo pipefail

API="http://localhost:8000"
PASS=0; FAIL=0

ok()   { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "[FAIL] $1 — $2"; FAIL=$((FAIL+1)); }

assert_status() {
    local label="$1" expected="$2" actual="$3"
    [ "$actual" = "$expected" ] && ok "$label" || fail "$label" "expected HTTP $expected, got $actual"
}

# ── Health check ────────────────────────────────────────────────────────────
echo "=== Health ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API/health)
assert_status "GET /health returns 200" 200 "$STATUS"
BODY=$(curl -s $API/health)
echo "$BODY" | grep -q '"status":"healthy"' && ok "health body has status:healthy" || fail "health body" "missing status:healthy"

# ── Upload validation ────────────────────────────────────────────────────────
echo ""
echo "=== Upload validation ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/upload)
assert_status "POST /upload with no fields returns 422" 422 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/upload \
    -F "operation=sum" -F "column=amount" \
    -F "file=@/dev/null;type=text/csv")
assert_status "POST /upload with empty file returns 400" 400 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/upload \
    -F "operation=sum" -F "column=amount" \
    -F "file=@/dev/null;type=application/vnd.ms-excel")
assert_status "POST /upload with unsupported type returns 415" 415 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/upload \
    -F "operation=filter" -F "column=cat" \
    -F "file=$(echo 'cat,val' | curl -s -F "file=@-;type=text/csv" --data-binary @- 2>/dev/null || echo '')")
# Simpler filter_value missing test via temp file
python3 -c "
import csv,io
buf=io.StringIO()
w=csv.writer(buf); w.writerow(['amount','cat']); [w.writerow([i,'A']) for i in range(10)]
print(buf.getvalue())" > /tmp/test_small.csv 2>/dev/null
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/upload \
    -F "operation=filter" -F "column=cat" \
    -F "file=@/tmp/test_small.csv;type=text/csv")
assert_status "POST /upload filter without filter_value returns 400" 400 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/upload \
    -F "operation=sum" -F "column=amount" -F "chunk_size_rows=0" \
    -F "file=@/tmp/test_small.csv;type=text/csv")
assert_status "POST /upload chunk_size_rows=0 returns 400" 400 "$STATUS"

# ── CSV upload + SUM pipeline ────────────────────────────────────────────────
echo ""
echo "=== CSV SUM pipeline ==="
python3 -c "
import csv,io
buf=io.StringIO()
w=csv.writer(buf); w.writerow(['amount','category','value'])
for i in range(1,101): w.writerow([i,'A' if i%3==0 else 'B',i*2])
print(buf.getvalue(),end='')" > /tmp/test_csv.csv

UPLOAD=$(curl -s -X POST $API/api/v1/upload \
    -F "operation=sum" -F "column=amount" -F "chunk_size_rows=30" \
    -F "file=@/tmp/test_csv.csv;type=text/csv")
echo "Upload response: $UPLOAD"
JOB_SUM=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
STATUS=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "uploaded" ] && ok "SUM upload status=uploaded" || fail "SUM upload status" "$STATUS"

PROC=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/process/$JOB_SUM)
assert_status "POST /process/$JOB_SUM returns 202" 202 "$PROC"

# Poll status up to 60s
for i in $(seq 1 20); do
    STAT=$(curl -s $API/api/v1/status/$JOB_SUM)
    S=$(echo "$STAT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    PROG=$(echo "$STAT" | python3 -c "import sys,json; print(json.load(sys.stdin)['progress'])")
    echo "  status=$S progress=$PROG"
    [ "$S" = "completed" ] || [ "$S" = "failed" ] && break
    sleep 3
done
[ "$S" = "completed" ] && ok "SUM job completed" || fail "SUM job status" "$S"

RESULT=$(curl -s $API/api/v1/result/$JOB_SUM)
RES_VAL=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
# sum(1..100) = 5050
python3 -c "import math; exit(0 if math.isclose($RES_VAL, 5050.0, rel_tol=1e-5) else 1)" \
    && ok "SUM result correct (5050.0, got $RES_VAL)" \
    || fail "SUM result wrong" "expected 5050, got $RES_VAL"

# ── MEAN pipeline ────────────────────────────────────────────────────────────
echo ""
echo "=== CSV MEAN pipeline ==="
UPLOAD=$(curl -s -X POST $API/api/v1/upload \
    -F "operation=mean" -F "column=amount" -F "chunk_size_rows=30" \
    -F "file=@/tmp/test_csv.csv;type=text/csv")
JOB_MEAN=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
curl -s -X POST $API/api/v1/process/$JOB_MEAN > /dev/null
for i in $(seq 1 20); do
    S=$(curl -s $API/api/v1/status/$JOB_MEAN | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    [ "$S" = "completed" ] || [ "$S" = "failed" ] && break; sleep 3
done
[ "$S" = "completed" ] && ok "MEAN job completed" || fail "MEAN job" "$S"
RES_VAL=$(curl -s $API/api/v1/result/$JOB_MEAN | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
# mean(1..100) = 50.5
python3 -c "import math; exit(0 if math.isclose($RES_VAL, 50.5, rel_tol=1e-5) else 1)" \
    && ok "MEAN result correct (50.5, got $RES_VAL)" \
    || fail "MEAN result wrong" "expected 50.5, got $RES_VAL"

# ── FILTER pipeline ──────────────────────────────────────────────────────────
echo ""
echo "=== CSV FILTER pipeline ==="
UPLOAD=$(curl -s -X POST $API/api/v1/upload \
    -F "operation=filter" -F "column=category" -F "filter_value=A" \
    -F "chunk_size_rows=30" \
    -F "file=@/tmp/test_csv.csv;type=text/csv")
JOB_FILT=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
curl -s -X POST $API/api/v1/process/$JOB_FILT > /dev/null
for i in $(seq 1 20); do
    S=$(curl -s $API/api/v1/status/$JOB_FILT | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    [ "$S" = "completed" ] || [ "$S" = "failed" ] && break; sleep 3
done
[ "$S" = "completed" ] && ok "FILTER job completed" || fail "FILTER job" "$S"
RES_VAL=$(curl -s $API/api/v1/result/$JOB_FILT | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
# rows where i%3==0 from 1..100: 3,6,...,99 = 33 rows
python3 -c "exit(0 if float('$RES_VAL') == 33.0 else 1)" \
    && ok "FILTER result correct (33 rows with category=A, got $RES_VAL)" \
    || fail "FILTER result wrong" "expected 33, got $RES_VAL"

# ── JSON pipeline ─────────────────────────────────────────────────────────────
echo ""
echo "=== JSON array pipeline ==="
python3 -c "
import json
records = [{'amount': i, 'category': 'X' if i%2==0 else 'Y'} for i in range(1,51)]
print(json.dumps(records))" > /tmp/test_json.json

UPLOAD=$(curl -s -X POST $API/api/v1/upload \
    -F "operation=sum" -F "column=amount" -F "chunk_size_rows=15" \
    -F "file=@/tmp/test_json.json;type=application/json")
JOB_JSON=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
curl -s -X POST $API/api/v1/process/$JOB_JSON > /dev/null
for i in $(seq 1 20); do
    S=$(curl -s $API/api/v1/status/$JOB_JSON | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    [ "$S" = "completed" ] || [ "$S" = "failed" ] && break; sleep 3
done
[ "$S" = "completed" ] && ok "JSON SUM job completed" || fail "JSON SUM job" "$S"
RES_VAL=$(curl -s $API/api/v1/result/$JOB_JSON | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
# sum(1..50) = 1275
python3 -c "import math; exit(0 if math.isclose($RES_VAL, 1275.0, rel_tol=1e-5) else 1)" \
    && ok "JSON SUM result correct (1275.0, got $RES_VAL)" \
    || fail "JSON SUM result wrong" "expected 1275, got $RES_VAL"

# ── API edge cases ────────────────────────────────────────────────────────────
echo ""
echo "=== Edge cases ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API/api/v1/status/00000000-0000-0000-0000-000000000000)
assert_status "GET /status unknown job returns 404" 404 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API/api/v1/result/00000000-0000-0000-0000-000000000000)
assert_status "GET /result unknown job returns 404" 404 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/process/00000000-0000-0000-0000-000000000000)
assert_status "POST /process unknown job returns 404" 404 "$STATUS"

# Result before completed
UPLOAD=$(curl -s -X POST $API/api/v1/upload \
    -F "operation=sum" -F "column=amount" \
    -F "file=@/tmp/test_csv.csv;type=text/csv")
JOB_EARLY=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API/api/v1/result/$JOB_EARLY)
assert_status "GET /result on uploaded (not processed) job returns 400" 400 "$STATUS"

# Double process
curl -s -X POST $API/api/v1/process/$JOB_SUM > /dev/null  # already completed
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/v1/process/$JOB_SUM)
assert_status "POST /process on completed job returns 400" 400 "$STATUS"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
