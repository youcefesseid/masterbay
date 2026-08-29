# Masterbay Cloudflare Worker Deployment
# Free tier: 100,000 requests/day, 1 GB KV storage

# 1. Install Wrangler (one-time)
# npm install -g wrangler

# 2. Login to Cloudflare
# wrangler login

# 3. Create KV namespace
# wrangler kv:namespace create "LICENSE_KV"
# wrangler kv:namespace create "LICENSE_KV" --preview

# 4. Update wrangler.toml with the returned IDs

# 5. Set secret (your HMAC secret)
# wrangler secret put LICENSE_SECRET
# Enter the 64-char hex string from: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 6. Deploy
# wrangler deploy

# Your worker will be at: https://masterbay-license.YOUR_DOMAIN.workers.dev
# Or with custom domain: https://license.yourdomain.com (add CNAME in Cloudflare DNS)

# 7. Generate license keys
# LICENSE_SECRET=your_secret node scripts/generate-license.js customer@email.com 365 encode presets batch pro

# 8. Add license metadata to KV (for features/expiry)
# wrangler kv:key put "meta:MB-XXXX..." '{"features":["encode","presets","batch","pro"],"expires":"2025-12-31T23:59:59Z","maxJobs":1000,"maxConcurrency":4}' --binding LICENSE_KV

# 9. Verify deployment
# curl -X POST https://license.yourdomain.com/verify \
#   -H "Content-Type: application/json" \
#   -d '{"licenseKey":"MB-...","email":"customer@email.com"}'