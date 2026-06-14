# Environment Variables

## peta-auth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | Yes | — | Session cookie signing secret (min 32 chars) |
| `JWT_SECRET` | No | — | JWT signing secret (min 32 chars) |
| `PETA_OAUTH_GITHUB_CLIENT_ID` | For GitHub OAuth | — | GitHub OAuth App client ID |
| `PETA_OAUTH_GITHUB_CLIENT_SECRET` | For GitHub OAuth | — | GitHub OAuth App client secret |
| `PETA_OAUTH_GOOGLE_CLIENT_ID` | For Google OAuth | — | Google OAuth client ID |
| `PETA_OAUTH_GOOGLE_CLIENT_SECRET` | For Google OAuth | — | Google OAuth client secret |

## ORM Integration Tests

| Variable | Default | Description |
|----------|---------|-------------|
| `INTEGRATION_PG_URL` | `postgres://postgres:postgres@localhost:5432/peta_orm_test` | PostgreSQL connection string |
| `INTEGRATION_MYSQL_URL` | `mysql://root:mysqlroot@localhost:3306/peta_orm_test` | MySQL connection string |
| `INTEGRATION_SKIP_PG` | — | Set to `1` to skip PostgreSQL tests |
| `INTEGRATION_SKIP_MYSQL` | — | Set to `1` to skip MySQL tests |

## Demo Apps

### Catalog

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SESSION_PASSWORD` | `change-me-32-chars-min!!-change-me-32-chars-min!!` | Session cookie signing secret |
| `NODE_ENV` | — | Set to `"test"` to skip lazy DB initialization |

### Conduit

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | `conduit-jwt-secret-change-in-production-32chars!!` | JWT signing secret |
| `NODE_ENV` | — | Set to `"test"` to skip lazy DB initialization |
