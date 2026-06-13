# ─── Authors API Tests ────────────────────────────────────────────────────
# Requires test/hurl/seed.ts to be run first

# 1. Login as admin
POST {{HOST}}/api/auth/login
Content-Type: application/json
{ "email": "admin@hurl.test", "password": "password123" }
HTTP 200
[Captures]
adminCookie: cookie "catalog-session"

# 2. Login as author
POST {{HOST}}/api/auth/login
Content-Type: application/json
{ "email": "author@hurl.test", "password": "password123" }
HTTP 200
[Captures]
authorCookie: cookie "catalog-session"

# 3. Login as user
POST {{HOST}}/api/auth/login
Content-Type: application/json
{ "email": "user@hurl.test", "password": "password123" }
HTTP 200
[Captures]
userCookie: cookie "catalog-session"

# 4. GET /authors — paginated list (seed has 1 author)
GET {{HOST}}/api/authors?page=1&limit=10
HTTP 200
[Asserts]
jsonpath "$.data" count >= 1
jsonpath "$.total" exists
jsonpath "$.perPage" exists

# 5. POST /authors as user — 403
POST {{HOST}}/api/authors
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{ "name": "Not Allowed", "bio": "Blocked" }
HTTP 403

# 6. POST /authors as author — 201
POST {{HOST}}/api/authors
Content-Type: application/json
Cookie: catalog-session={{authorCookie}}
{ "name": "My New Profile", "bio": "Written by me" }
HTTP 201
[Asserts]
jsonpath "$.name" == "My New Profile"
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
[Captures]
authorId: jsonpath "$.id"

# 7. GET /authors/:id — newly created
GET {{HOST}}/api/authors/{{authorId}}
HTTP 200
[Asserts]
jsonpath "$.name" == "My New Profile"
jsonpath "$.books" count == 0

# 8. PATCH /authors/:id as user — 403
PATCH {{HOST}}/api/authors/{{authorId}}
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{ "name": "Hacked Name" }
HTTP 403

# 9. PATCH /authors/:id as owner — 200
PATCH {{HOST}}/api/authors/{{authorId}}
Content-Type: application/json
Cookie: catalog-session={{authorCookie}}
{ "name": "Updated Name", "bio": "Updated bio" }
HTTP 200
[Asserts]
jsonpath "$.name" == "Updated Name"
jsonpath "$.bio" == "Updated bio"

# 10. PATCH /authors/:id as admin — 200
PATCH {{HOST}}/api/authors/{{authorId}}
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{ "name": "Admin Renamed" }
HTTP 200
[Asserts]
jsonpath "$.name" == "Admin Renamed"

# 11. DELETE /authors/:id as user — 403
DELETE {{HOST}}/api/authors/{{authorId}}
Cookie: catalog-session={{userCookie}}
HTTP 403

# 12. DELETE /authors/:id as owner — 204
DELETE {{HOST}}/api/authors/{{authorId}}
Cookie: catalog-session={{authorCookie}}
HTTP 204

# 13. GET /authors/:id after delete — 404 (soft-deleted, filtered out)
GET {{HOST}}/api/authors/{{authorId}}
HTTP 404
