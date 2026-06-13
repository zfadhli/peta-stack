# ─── Categories API Tests ─────────────────────────────────────────────────
# Requires test/hurl/seed.ts to be run first

# 1. Login as admin
POST {{HOST}}/api/auth/login
Content-Type: application/json
{
  "email": "admin@hurl.test",
  "password": "password123"
}
HTTP 200
[Captures]
adminCookie: cookie "catalog-session"

# 2. Login as user
POST {{HOST}}/api/auth/login
Content-Type: application/json
{
  "email": "user@hurl.test",
  "password": "password123"
}
HTTP 200
[Captures]
userCookie: cookie "catalog-session"

# 3. GET /categories — has seeded category
GET {{HOST}}/api/categories
HTTP 200
[Asserts]
jsonpath "$" count >= 1
jsonpath "$[0].name" == "Hurl Category"

# 4. POST /categories as user — 403
POST {{HOST}}/api/categories
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{
  "name": "Blocked",
  "description": "Should not be created"
}
HTTP 403

# 5. POST /categories as admin — 201
POST {{HOST}}/api/categories
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{
  "name": "Science Fiction",
  "description": "Sci-fi books"
}
HTTP 201
[Asserts]
jsonpath "$.name" == "Science Fiction"
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
[Captures]
catId: jsonpath "$.id"

# 6. GET /categories/:id — newly created
GET {{HOST}}/api/categories/{{catId}}
HTTP 200
[Asserts]
jsonpath "$.name" == "Science Fiction"

# 7. POST /categories duplicate name — 409
POST {{HOST}}/api/categories
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{
  "name": "Science Fiction",
  "description": "Duplicate"
}
HTTP 409

# 8. PATCH /categories as user — 403
PATCH {{HOST}}/api/categories/{{catId}}
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{
  "name": "Hacked Name"
}
HTTP 403

# 9. PATCH /categories as admin — 200
PATCH {{HOST}}/api/categories/{{catId}}
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{
  "name": "Sci-Fi Updated",
  "description": "Updated description"
}
HTTP 200
[Asserts]
jsonpath "$.name" == "Sci-Fi Updated"
jsonpath "$.description" == "Updated description"

# 10. DELETE /categories as user — 403
DELETE {{HOST}}/api/categories/{{catId}}
Cookie: catalog-session={{userCookie}}
HTTP 403

# 11. DELETE /categories as admin — 204
DELETE {{HOST}}/api/categories/{{catId}}
Cookie: catalog-session={{adminCookie}}
HTTP 204

# 12. GET /categories/:id after delete — 404
GET {{HOST}}/api/categories/{{catId}}
HTTP 404
