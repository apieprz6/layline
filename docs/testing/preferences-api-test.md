# User Preferences API Testing Guide

Manual testing guide for `/api/preferences` endpoints (LAY-11).

## Prerequisites

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Sign in to get an auth token:
   - Navigate to http://localhost:3000/auth/login
   - Sign in with a test account
   - Open browser DevTools → Application → Cookies
   - Copy the value of `sb-access-token` cookie

## Test Cases

### 1. GET /api/preferences (No Profile Exists)

**Expected**: Returns default preferences (all sources enabled).

```bash
curl -X GET 'http://localhost:3000/api/preferences' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE'
```

**Expected Response (200)**:
```json
{
  "dataSources": {
    "chii2": {
      "enabled": true,
      "displayName": "Harrison Dever Crib"
    },
    "45198": {
      "enabled": true,
      "displayName": "Purdue Buoy"
    }
  }
}
```

### 2. PUT /api/preferences (Create Profile)

**Expected**: Creates profile with custom preferences.

```bash
curl -X PUT 'http://localhost:3000/api/preferences' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE' \
  -d '{
    "dataSources": {
      "chii2": {
        "enabled": false,
        "displayName": "Harrison Dever Crib"
      },
      "45198": {
        "enabled": true,
        "displayName": "Purdue Buoy"
      }
    }
  }'
```

**Expected Response (200)**:
```json
{
  "dataSources": {
    "chii2": {
      "enabled": false,
      "displayName": "Harrison Dever Crib"
    },
    "45198": {
      "enabled": true,
      "displayName": "Purdue Buoy"
    }
  }
}
```

### 3. GET /api/preferences (Profile Exists)

**Expected**: Returns stored preferences (chii2 disabled from previous PUT).

```bash
curl -X GET 'http://localhost:3000/api/preferences' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE'
```

**Expected Response (200)**:
```json
{
  "dataSources": {
    "chii2": {
      "enabled": false,
      "displayName": "Harrison Dever Crib"
    },
    "45198": {
      "enabled": true,
      "displayName": "Purdue Buoy"
    }
  }
}
```

### 4. PUT /api/preferences (Update Profile)

**Expected**: Updates existing profile.

```bash
curl -X PUT 'http://localhost:3000/api/preferences' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE' \
  -d '{
    "dataSources": {
      "chii2": {
        "enabled": true,
        "displayName": "Harrison Dever Crib"
      },
      "45198": {
        "enabled": false,
        "displayName": "Purdue Buoy"
      }
    }
  }'
```

**Expected Response (200)**:
```json
{
  "dataSources": {
    "chii2": {
      "enabled": true,
      "displayName": "Harrison Dever Crib"
    },
    "45198": {
      "enabled": false,
      "displayName": "Purdue Buoy"
    }
  }
}
```

## Error Cases

### 5. GET /api/preferences (Unauthenticated)

```bash
curl -X GET 'http://localhost:3000/api/preferences'
```

**Expected Response (401)**:
```json
{
  "error": "Unauthorized"
}
```

### 6. PUT /api/preferences (Unauthenticated)

```bash
curl -X PUT 'http://localhost:3000/api/preferences' \
  -H 'Content-Type: application/json' \
  -d '{"dataSources": {}}'
```

**Expected Response (401)**:
```json
{
  "error": "Unauthorized"
}
```

### 7. PUT /api/preferences (Invalid JSON)

```bash
curl -X PUT 'http://localhost:3000/api/preferences' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE' \
  -d 'invalid json'
```

**Expected Response (400)**:
```json
{
  "error": "Invalid JSON payload"
}
```

### 8. PUT /api/preferences (Invalid Structure - Missing Field)

```bash
curl -X PUT 'http://localhost:3000/api/preferences' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE' \
  -d '{
    "dataSources": {
      "chii2": {
        "enabled": true
      }
    }
  }'
```

**Expected Response (400)**:
```json
{
  "error": "Invalid preferences structure"
}
```

### 9. PUT /api/preferences (Invalid Structure - Wrong Type)

```bash
curl -X PUT 'http://localhost:3000/api/preferences' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sb-access-token=YOUR_TOKEN_HERE' \
  -d '{
    "dataSources": {
      "chii2": {
        "enabled": "yes",
        "displayName": "Harrison Dever Crib"
      },
      "45198": {
        "enabled": true,
        "displayName": "Purdue Buoy"
      }
    }
  }'
```

**Expected Response (400)**:
```json
{
  "error": "Invalid preferences structure"
}
```

## Postman Collection

Alternatively, import this collection into Postman:

1. Create new request: `GET {{baseUrl}}/api/preferences`
2. Create new request: `PUT {{baseUrl}}/api/preferences`
3. Set environment variable: `baseUrl = http://localhost:3000`
4. Add auth cookie to requests

## Verify in Database

Check the profile was created/updated:

```bash
# Using Supabase Studio
# Navigate to: http://localhost:54323 (or your Supabase URL)
# Go to Table Editor → profiles
# Verify preferences column contains correct JSONB
```

Or use SQL:

```sql
SELECT user_id, preferences, updated_at 
FROM profiles 
WHERE user_id = 'YOUR_USER_ID';
```

## Success Criteria ✓

- [x] API route created at `/app/api/preferences/route.ts`
- [x] GET handler fetches from profiles table
- [x] GET returns default if no record exists
- [x] PUT handler updates with validation
- [x] Default preferences structure implemented
- [x] Auth check via Supabase server client
- [x] Error handling: 401, 400, 500
- [x] Manually testable via curl/Postman
