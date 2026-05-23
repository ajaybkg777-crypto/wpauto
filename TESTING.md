# WaAuto - API Testing Guide

## Overview
This guide provides curl commands and scenarios to test all API endpoints. Use Postman or curl to run these tests.

## Prerequisites
- Backend running on `http://localhost:5000`
- MongoDB connected
- Valid JWT token

## Getting Started

### 1. Set Up Variables

```bash
# Windows PowerShell
$BASE_URL = "http://localhost:5000"
$API = "$BASE_URL/api"

# Linux/Mac bash
export BASE_URL="http://localhost:5000"
export API="$BASE_URL/api"
```

### 2. Get Test Token

First, register as a new school owner or login:

```bash
curl -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test School",
    "email": "testschool@example.com",
    "password": "TestPassword123!",
    "schoolName": "Test School 2024"
  }'
```

Response will include a token:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

Save the token:
```bash
# Windows
$TOKEN = "your_token_here"

# Linux/Mac
export TOKEN="your_token_here"
```

---

## Authentication Endpoints

### Test 1: Register School Owner

```bash
curl -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@school.com",
    "password": "Password123!",
    "schoolName": "ABC School"
  }'
```

**Expected**: 201 Created with user and token

### Test 2: Login

```bash
curl -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@school.com",
    "password": "Password123!"
  }'
```

**Expected**: 200 OK with token

### Test 3: Get Current User

```bash
curl -X GET $API/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with user profile

### Test 4: Update Profile

```bash
curl -X PUT $API/auth/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Updated",
    "phone": "+919876543210"
  }'
```

**Expected**: 200 OK with updated profile

---

## School Endpoints

### Test 5: Get School Profile

```bash
curl -X GET $API/schools/profile \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with school details

### Test 6: Update School Profile

```bash
curl -X PUT $API/schools/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated School Name",
    "phone": "+919876543210",
    "address": "123 Main St"
  }'
```

**Expected**: 200 OK with updated school

### Test 7: Get Dashboard Stats

```bash
curl -X GET $API/schools/stats \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with statistics:
- totalLeads
- interestedLeads
- pendingLeads
- notInterestedLeads
- messagesSent
- messagesDelivered
- messagesRead

### Test 8: Get WhatsApp Status

```bash
curl -X GET $API/schools/whatsapp/status \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with connection status

### Test 9: Configure WhatsApp

```bash
curl -X PUT $API/schools/whatsapp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gupshup",
    "apiKey": "your_gupshup_api_key",
    "appName": "your_app_name",
    "phoneNumber": "+919876543210"
  }'
```

**Expected**: 200 OK with updated WhatsApp config

---

## Lead Management Endpoints

### Test 10: Create Single Lead

```bash
curl -X POST $API/leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Raj Kumar",
    "phone": "+919876543210",
    "email": "raj@example.com",
    "status": "new",
    "source": "manual"
  }'
```

**Expected**: 201 Created with lead ID

### Test 11: List Leads

```bash
curl -X GET "$API/leads?page=1&limit=20&status=new" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with paginated leads

### Test 12: Get Lead Details

```bash
curl -X GET $API/leads/{leadId} \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with lead details and conversation history

### Test 13: Update Lead

```bash
curl -X PUT $API/leads/{leadId} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "interested",
    "notes": "Very interested in course"
  }'
```

**Expected**: 200 OK with updated lead

### Test 14: Add Message to Lead

```bash
curl -X POST $API/leads/{leadId}/conversation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Are you interested?",
    "direction": "outbound"
  }'
```

**Expected**: 200 OK with updated conversation

### Test 15: Delete Lead

```bash
curl -X DELETE $API/leads/{leadId} \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with success message

---

## WhatsApp Messaging Endpoints

### Test 16: Send Text Message

```bash
curl -X POST $API/whatsapp/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "message": "Hello from WaAuto!"
  }'
```

**Expected**: 200 OK with message ID

### Test 17: Get Message Status

```bash
curl -X GET "$API/whatsapp/status/{messageId}" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with status (sent/delivered/read)

---

## Chatbot Endpoints

### Test 18: Create Chatbot Rule

```bash
curl -X POST $API/chatbot/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "hello",
    "response": "Hi! Welcome to our school. How can I help?",
    "matchType": "contains",
    "priority": 1,
    "isFallback": false
  }'
```

**Expected**: 201 Created with rule ID

### Test 19: List Chatbot Rules

```bash
curl -X GET $API/chatbot/rules \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with all rules

### Test 20: Update Rule

```bash
curl -X PUT $API/chatbot/rules/{ruleId} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "response": "Updated response message",
    "priority": 2
  }'
```

**Expected**: 200 OK with updated rule

### Test 21: Test Chatbot

```bash
curl -X POST $API/chatbot/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "hello"
  }'
```

**Expected**: 200 OK with matching response or fallback

### Test 22: Delete Rule

```bash
curl -X DELETE $API/chatbot/rules/{ruleId} \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with success message

---

## Broadcast Endpoints

### Test 23: Create Broadcast

```bash
curl -X POST $API/broadcasts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Welcome Campaign",
    "message": "Welcome to our school!",
    "recipients": ["leadId1", "leadId2", "leadId3"],
    "scheduledAt": null
  }'
```

**Expected**: 201 Created with broadcast ID

### Test 24: List Broadcasts

```bash
curl -X GET $API/broadcasts \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with all broadcasts

### Test 25: Start Broadcast

```bash
curl -X POST "$API/broadcasts/{broadcastId}/start" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK - broadcast starts sending

### Test 26: Delete Broadcast

```bash
curl -X DELETE "$API/broadcasts/{broadcastId}" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with success message

---

## Subscription Endpoints

### Test 27: Get Plans

```bash
curl -X GET $API/subscription/plans
```

**Expected**: 200 OK with all subscription plans

### Test 28: Get Current Subscription

```bash
curl -X GET $API/subscription/current \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: 200 OK with current plan details

### Test 29: Create Razorpay Order

```bash
curl -X POST $API/subscription/create-order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "basic"
  }'
```

**Expected**: 201 Created with order ID

### Test 30: Verify Payment

```bash
curl -X POST $API/subscription/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "razorpayOrderId": "order_XXXXX",
    "razorpayPaymentId": "pay_XXXXX",
    "razorpaySignature": "signature_xxxxx"
  }'
```

**Expected**: 200 OK with subscription updated

---

## Webhook Endpoint

### Test 31: Incoming Message Webhook

```bash
curl -X POST $API/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message",
    "phone": "919876543210",
    "message": "Hi, I need admission info",
    "timestamp": "2026-05-02T12:00:00Z"
  }'
```

**Expected**: 200 OK - processes message

### Test 32: Webhook Verification

```bash
curl -X GET "$API/webhook/whatsapp?token=verify_token"
```

**Expected**: 200 OK with challenge response

---

## Testing Scenarios

### Scenario 1: Complete Lead Flow
1. Create lead (Test 10)
2. Add message to lead (Test 14)
3. Update lead status to "interested" (Test 13)
4. View lead details (Test 12)

### Scenario 2: Broadcast Campaign
1. Create 3+ leads (Test 10)
2. Create broadcast (Test 23)
3. Start broadcast (Test 25)
4. Verify messages sent via stats (Test 7)

### Scenario 3: Chatbot Automation
1. Create rule for "admission" (Test 18)
2. Test chatbot with "admission" message (Test 21)
3. Update rule response (Test 20)
4. Retest chatbot (Test 21)

### Scenario 4: WhatsApp Integration
1. Configure WhatsApp (Test 9)
2. Check status (Test 8)
3. Send test message (Test 16)
4. Check delivery status (Test 17)

### Scenario 5: Subscription Flow
1. Get plans (Test 27)
2. Check current subscription (Test 28)
3. Create order (Test 29)
4. Verify payment (Test 30)

---

## Error Codes Reference

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Bad Request | Check request format and parameters |
| 401 | Unauthorized | Verify JWT token is valid |
| 403 | Forbidden | Check user role and permissions |
| 404 | Not Found | Verify resource ID exists |
| 409 | Conflict | Resource already exists |
| 429 | Too Many Requests | Rate limit exceeded, wait before retrying |
| 500 | Server Error | Check server logs |

---

## Performance Testing

### Load Testing Broadcast

```bash
# Create 100 recipients
for i in {1..100}; do
  curl -X POST $API/leads \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"Test Lead $i\",
      \"phone\": \"+9198765432$((10+i))\",
      \"source\": \"manual\"
    }"
done

# Create and start broadcast
curl -X POST $API/broadcasts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Load Test Broadcast",
    "message": "Testing bulk messages",
    "selectAll": true
  }'
```

---

## Debugging Tips

1. **Enable Debug Logs**: Check backend console output
2. **Check Request Headers**: Verify Authorization header
3. **Validate JSON**: Use `jsonlint.com` for format checking
4. **Test in Postman**: Easier for complex requests
5. **Check MongoDB**: Verify data is being stored
6. **Review API Logs**: See request/response details

---

## Next Steps

- Set up Postman collection (can export from backend)
- Create integration tests with Jest
- Set up GitHub Actions for CI/CD
- Add performance monitoring
- Set up error tracking with Sentry

For issues, check README.md and QUICK_START.md documentation.
