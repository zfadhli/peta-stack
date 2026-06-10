# Nuxt Auth Example

## Setup

Install the peer dependency:

```bash
bun add peta-auth
```

Set the session password in `.env`:

```env
NUXT_SESSION_PASSWORD=your-secret-at-least-32-characters-long
```

That's it. The routes in `server/api/` use `useSession` from `peta-auth/nuxt` automatically.

## Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/signup` | Sign up with bcrypt — body: `{ email, password, name }` |
| `POST` | `/api/login` | Log in — body: `{ name }` or `{ email, password }` — explicit `useSession(event, { password, cookieName })` |
| `POST` | `/api/logout` | Clear session |
| `GET`  | `/api/profile` | Return current user or 401 |
| `GET`  | `/api/views` | Increment + return page view count |
| `GET`  | `/auth/github` | GitHub OAuth login |
| `GET`  | `/auth/google` | Google OAuth login (PKCE) |

## Testing

```bash
curl http://localhost:3000/api/profile
# {"statusCode":401,"statusMessage":"Not logged in"}

curl -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jason"}' \
  -c cookies.txt
# {"ok":true}

curl http://localhost:3000/api/profile -b cookies.txt
# {"name":"Jason"}
```
