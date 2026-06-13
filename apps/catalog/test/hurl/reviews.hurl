# ─── Reviews API Tests ────────────────────────────────────────────────────
# Requires test/hurl/seed.ts to be run first

# 1. Login as author (has linked author profile)
POST {{HOST}}/api/auth/login
Content-Type: application/json
{ "email": "author@hurl.test", "password": "password123" }
HTTP 200
[Captures]
authorCookie: cookie "catalog-session"

# 2. Login as user (can create reviews)
POST {{HOST}}/api/auth/login
Content-Type: application/json
{ "email": "user@hurl.test", "password": "password123" }
HTTP 200
[Captures]
userCookie: cookie "catalog-session"

# 3. Login again as author (for non-owner tests)
POST {{HOST}}/api/auth/login
Content-Type: application/json
{ "email": "author@hurl.test", "password": "password123" }
HTTP 200
[Captures]
author2Cookie: cookie "catalog-session"

# 4. Create a book as author
POST {{HOST}}/api/books
Content-Type: application/json
Cookie: catalog-session={{authorCookie}}
{
  "title": "Reviewable Book",
  "isbn": "9780000000201",
  "price": 9.99,
  "inStock": true
}
HTTP 201
[Asserts]
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
[Captures]
bookId: jsonpath "$.id"

# 5. GET /books/:id/reviews — empty
GET {{HOST}}/api/books/{{bookId}}/reviews?page=1&limit=10
HTTP 200
[Asserts]
jsonpath "$.data" count == 0

# 6. POST review as unauthenticated — 401
POST {{HOST}}/api/books/{{bookId}}/reviews
Content-Type: application/json
{ "rating": 5, "body": "Great!" }
HTTP 401

# 7. POST review as authenticated user — 201
POST {{HOST}}/api/books/{{bookId}}/reviews
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{ "rating": 5, "body": "Amazing book!" }
HTTP 201
[Asserts]
jsonpath "$.rating" == 5
jsonpath "$.body" == "Amazing book!"
jsonpath "$.id" matches "^[0-9A-Z]{26}$"
[Captures]
reviewId: jsonpath "$.id"

# 8. POST review for non-existent book — 404
POST {{HOST}}/api/books/nonexistent/reviews
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{ "rating": 3 }
HTTP 404

# 9. GET /books/:id/reviews — has the review
GET {{HOST}}/api/books/{{bookId}}/reviews?page=1&limit=10
HTTP 200
[Asserts]
jsonpath "$.data" count >= 1

# 10. PATCH review as non-owner — 403
PATCH {{HOST}}/api/books/{{bookId}}/reviews/{{reviewId}}
Content-Type: application/json
Cookie: catalog-session={{author2Cookie}}
{ "rating": 1 }
HTTP 403

# 11. PATCH review as owner — 200
PATCH {{HOST}}/api/books/{{bookId}}/reviews/{{reviewId}}
Content-Type: application/json
Cookie: catalog-session={{userCookie}}
{ "rating": 4, "body": "Updated review" }
HTTP 200
[Asserts]
jsonpath "$.rating" == 4
jsonpath "$.body" == "Updated review"

# 12. DELETE review as non-owner — 403
DELETE {{HOST}}/api/books/{{bookId}}/reviews/{{reviewId}}
Cookie: catalog-session={{author2Cookie}}
HTTP 403

# 13. DELETE review as owner — 204
DELETE {{HOST}}/api/books/{{bookId}}/reviews/{{reviewId}}
Cookie: catalog-session={{userCookie}}
HTTP 204
