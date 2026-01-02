#!/bin/bash

# Test Script for Late Arrival & Half-Day Check-in Logic
# Demonstrates the new check-in status logic

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  LATE ARRIVAL & HALF-DAY CHECK-IN TEST SCRIPT               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Get authentication token
echo "📝 Getting authentication token..."
TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "muhammad.hunain@digious.com", "password": "karachi123"}' \
  | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get authentication token"
  exit 1
fi

echo "✅ Authentication successful"
echo ""

# Test function
test_checkin() {
  local employee_id=$1
  local name=$2
  local email=$3
  local test_num=$4
  local expected_status=$5
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Test $test_num: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  RESPONSE=$(curl -s -X POST "http://localhost:5000/api/v1/attendance/check-in" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"employee_id\": $employee_id,
      \"email\": \"$email\",
      \"name\": \"$name\",
      \"device_info\": \"Test Device\",
      \"ip_address\": \"127.0.0.1\"
    }")
  
  echo "Response:"
  echo "$RESPONSE" | jq '.'
  
  STATUS=$(echo "$RESPONSE" | jq -r '.data.status // .status')
  
  if [ "$STATUS" = "$expected_status" ]; then
    echo "✅ PASS: Status is $STATUS (Expected: $expected_status)"
  else
    echo "❌ FAIL: Status is $STATUS (Expected: $expected_status)"
  fi
  
  echo ""
}

# Note: In real usage, you would update system time or mock the check-in time
# For now, showing the test structure

echo "Test Cases:"
echo ""
echo "1. On-Time Evening Check-in (21:05) → Expected: Present"
echo "2. Late Evening Check-in (22:30) → Expected: Late"
echo "3. On-Time Early Morning Check-in (01:15) → Expected: Present"
echo "4. Half-Day Early Morning Check-in (03:45) → Expected: Half Day"
echo ""

echo "Note: These tests require modifying system time or using check-in time mock"
echo "To test manually, follow these steps:"
echo ""
echo "1. Set system time to 21:05 and check-in → Should be 'Present'"
echo "2. Set system time to 22:30 and check-in → Should be 'Late' with late_by_minutes"
echo "3. Set system time to 01:15 and check-in → Should be 'Present'"
echo "4. Set system time to 03:45 and check-in → Should be 'Half Day'"
echo ""

echo "Example curl command for manual testing:"
echo ""
echo "curl -X POST http://localhost:5000/api/v1/attendance/check-in \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Authorization: Bearer \$TOKEN\" \\"
echo "  -d '{"
echo "    \"employee_id\": 1,"
echo "    \"email\": \"sara@digious.com\","
echo "    \"name\": \"Sara Ahmed\","
echo "    \"device_info\": \"Mobile\","
echo "    \"ip_address\": \"192.168.1.100\""
echo "  }'"
echo ""

echo "✅ Test script prepared - Ready for manual testing"
