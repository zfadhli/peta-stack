# ─── Books API Tests ──────────────────────────────────────────────────────
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

# 4. GET /books — paginated list
GET {{HOST}}/api/books?page=1&limit=10
HTTP 200
[Asserts]
jsonpath "$.data" exists
jsonpath "$.total" exists
jsonpath "$.perPage" exists

# 5. POST /books as user — 403 (no author profile)
POST {{HOST}}/api/books
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{
  "title": "Stolen Book",
  "isbn": "9780000000101",
  "price": 9.99,
  "inStock": true
}
HTTP 403

# 6. POST /books as author — 201, auto-sets authorId
POST {{HOST}}/api/books
Content-Type: application/json
Cookie: catalog-session={{authorCookie}}
{
  "title": "My First Book",
  "isbn": "9780000000102",
  "price": 14.99,
  "inStock": true
}
HTTP 201
[Asserts]
jsonpath "$.title" == "My First Book"
jsonpath "$.authorId" matches "^[0-9A-Z]{26}$"
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
[Captures]
bookId: jsonpath "$.id"

# 7. Admin creates their own author profile (admin can do this via hierarchy)
POST {{HOST}}/api/authors
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{
  "name": "Admin's Author Profile",
  "bio": "Created by admin"
}
HTTP 201
[Asserts]
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
[Captures]
adminAuthorId: jsonpath "$.id"

# 8. POST /books as admin — 201 with explicit authorId (different from author's)
POST {{HOST}}/api/books
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{
  "title": "Admin's Book",
  "isbn": "9780000000103",
  "price": 29.99,
  "authorId": "{{adminAuthorId}}",
  "inStock": true
}
HTTP 201
[Asserts]
jsonpath "$.title" == "Admin's Book"
jsonpath "$.authorId" == "{{adminAuthorId}}"
[Captures]
adminBookId: jsonpath "$.id"

# 8. GET /books/:id — existing book
GET {{HOST}}/api/books/{{bookId}}
HTTP 200
[Asserts]
jsonpath "$.title" == "My First Book"

# 9. GET /books/:id — non-existent
GET {{HOST}}/api/books/nonexistent
HTTP 404

# 10. PATCH /books/:id as non-owner author — 403
PATCH {{HOST}}/api/books/{{adminBookId}}
Content-Type: application/json
Cookie: catalog-session={{authorCookie}}
{ "title": "Not Mine" }
HTTP 403

# 11. PATCH /books/:id as owner author — 200
PATCH {{HOST}}/api/books/{{bookId}}
Content-Type: application/json
Cookie: catalog-session={{authorCookie}}
{ "title": "Updated Title", "price": 19.99 }
HTTP 200
[Asserts]
jsonpath "$.title" == "Updated Title"
jsonpath "$.price" == 19.99

# 12. PATCH /books/:id as admin — 200
PATCH {{HOST}}/api/books/{{bookId}}
Content-Type: application/json
Cookie: catalog-session={{adminCookie}}
{ "title": "Admin Updated", "price": 5.99 }
HTTP 200
[Asserts]
jsonpath "$.title" == "Admin Updated"

# 13. DELETE /books/:id as non-owner — 403
DELETE {{HOST}}/api/books/{{adminBookId}}
Cookie: catalog-session={{authorCookie}}
HTTP 403

# 14. DELETE /books/:id as owner — 204
DELETE {{HOST}}/api/books/{{bookId}}
Cookie: catalog-session={{authorCookie}}
HTTP 204

# 15. GET /books/:id after soft-delete — 404 (filtered out by default scope)
GET {{HOST}}/api/books/{{bookId}}
HTTP 404
