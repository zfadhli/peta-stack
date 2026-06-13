# ─── Auth API Tests ───────────────────────────────────────────────────────

# 1. Signup creates a new user
POST {{HOST}}/api/auth/signup
Content-Type: application/json
{
  "email": "alice@hurl.test",
  "password": "password123",
  "name": "Alice"
}
HTTP 201
[Asserts]
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
jsonpath "$.email" == "alice@hurl.test"
jsonpath "$.name" == "Alice"
jsonpath "$.role" == "user"
jsonpath "$.passwordHash" not exists
[Captures]
aliceCookie: cookie "catalog-session"

# 2. Signup with duplicate email returns 409
POST {{HOST}}/api/auth/signup
Content-Type: application/json
{
  "email": "alice@hurl.test",
  "password": "password123",
  "name": "Alice Duplicate"
}
HTTP 409
[Asserts]
jsonpath "$.error" contains "email"

# 3. Login with valid credentials
POST {{HOST}}/api/auth/login
Content-Type: application/json
{
  "email": "alice@hurl.test",
  "password": "password123"
}
HTTP 200
[Asserts]
jsonpath "$.email" == "alice@hurl.test"
jsonpath "$.id" matches "^[0-9A-Z]{26}$"

# 4. Login with wrong password
POST {{HOST}}/api/auth/login
Content-Type: application/json
{
  "email": "alice@hurl.test",
  "password": "wrongpassword"
}
HTTP 401

# 5. Login with non-existent email
POST {{HOST}}/api/auth/login
Content-Type: application/json
{
  "email": "nobody@hurl.test",
  "password": "password123"
}
HTTP 401

# 6. GET /me with valid session cookie
GET {{HOST}}/api/auth/me
Cookie: catalog-session={{aliceCookie}}
HTTP 200
[Asserts]
jsonpath "$.email" == "alice@hurl.test"

# 7. GET /me without cookie
GET {{HOST}}/api/auth/me
HTTP 401

# 8. Logout succeeds
POST {{HOST}}/api/auth/logout
Cookie: catalog-session={{aliceCookie}}
HTTP 200
[Asserts]
jsonpath "$.ok" == true
