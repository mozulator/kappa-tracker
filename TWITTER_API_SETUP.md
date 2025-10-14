# Twitter API Setup Guide

The BSG Tweets section uses a server-side Twitter feed to avoid rate limiting issues. To enable full tweet display, you need to configure Twitter API v2 credentials.

## Quick Start (Without API Keys)

**The site works immediately without any setup!** If no Twitter API key is configured, the page will show:
- Links to view profiles on Twitter
- "Twitter API not configured" message
- Full fallback functionality

## Full Setup (With Twitter API)

To display actual tweets, follow these steps:

### 1. Get Twitter API Access

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Sign up for a developer account (it's free!)
3. Create a new "Project" and "App"
4. Navigate to your App's "Keys and Tokens" section
5. Generate a **Bearer Token** (keep it secret!)

### 2. Add Environment Variable

#### Local Development (`.env` file):
```env
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

#### Production (Render.com):
1. Go to your Render dashboard
2. Navigate to your service
3. Go to "Environment" tab
4. Add new environment variable:
   - **Key:** `TWITTER_BEARER_TOKEN`
   - **Value:** Your bearer token
5. Click "Save Changes" (service will restart automatically)

### 3. Restart Server

The server will automatically detect the token and start fetching real tweets!

## Features

✅ **10-minute caching** - Minimizes API calls  
✅ **Automatic fallback** - Works without API keys  
✅ **Clean display** - Shows 5 latest tweets per account  
✅ **No rate limits** - Server-side fetching avoids client-side limits  
✅ **Linkified content** - Auto-links @mentions, #hashtags, and URLs  
✅ **Engagement metrics** - Shows likes, retweets, and replies  

## Twitter API Limits

- **Free Tier:** 500,000 tweets/month (more than enough!)
- **With caching:** ~500 requests/day maximum
- **Our usage:** <100 requests/day with 10-minute cache

## Troubleshooting

**"Twitter API not configured" message?**
- Check that `TWITTER_BEARER_TOKEN` environment variable is set
- Verify the token is correct (no extra spaces)
- Restart the server after adding the variable

**"Failed to load tweets" error?**
- Check server logs for Twitter API errors
- Verify your Twitter API app has "Read" permissions
- Ensure you're not exceeding API rate limits

**Still showing fallback?**
- Wait 10 minutes for cache to expire
- Hard refresh the page (Ctrl+F5)
- Check browser console for errors

## Support

If you have issues, check the server logs for detailed error messages:
```bash
# Local
npm start

# Production (Render)
View logs in Render dashboard
```

