# Render.com Build Configuration

## Build Command
```bash
npm install && npm run build
```

## Start Command
```bash
npm start
```

## Environment Variables Required
Make sure these are set in Render dashboard:

### Required
- `NODE_ENV=production`
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (optional, for rate limiting)
- `JWT_SECRET` - Strong random secret for JWT tokens
- `JWT_REFRESH_SECRET` - Strong random secret for refresh tokens
- `ENCRYPTION_KEY` - 32-byte hex string for AES-256-GCM encryption
- `FRONTEND_URL` - Your Render.com frontend URL (e.g., https://your-app.onrender.com)

### Optional
- `PORT=3000` (Render sets this automatically)
- `LOG_LEVEL=info`
- `AUDIT_LOG_RETENTION_DAYS=90`
- `SESSION_TIMEOUT_MINUTES=30`

## Google Service Account
Upload your Google Service Account JSON to Render as an environment variable:
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Paste entire JSON content

## Build Process
1. Render clones your repo
2. Runs `npm install` to install dependencies (including Vite, Vue, etc.)
3. Runs `npm run build` which executes `vite build`
4. Vite compiles Vue SFCs into optimized JavaScript
5. Output goes to `dist/` folder
6. Starts Express server with `npm start`
7. Express serves `dist/` folder in production mode

## Post-Deploy
After first deploy, run Prisma migrations:
```bash
npx prisma migrate deploy
```

## Security Notes
✅ **CSP is now STRICT** - No `unsafe-inline` for scripts, No `unsafe-eval`
✅ Vue templates are pre-compiled by Vite
✅ No runtime template compilation
✅ Production-ready security posture

## Development vs Production
- **Development**: Vite dev server on port 5173, Express on port 3000
- **Production**: Express serves pre-built `dist/` folder on $PORT (from Render)
