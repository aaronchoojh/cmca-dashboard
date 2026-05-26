# CMC Alliance Subscription Dashboard

## Deploying to Netlify

### 1. Upload to GitHub
1. Create a new repo on github.com (can be private)
2. Upload all these files maintaining the folder structure:
   ```
   cmca-dashboard/
   ├── netlify.toml
   ├── netlify/
   │   └── functions/
   │       └── sheets.js
   └── public/
       ├── index.html
       ├── style.css
       └── app.js
   ```

### 2. Connect to Netlify
1. Go to netlify.com → Add new site → Import from GitHub
2. Select your repo
3. Build settings are auto-detected from netlify.toml
4. Click Deploy

### 3. Set environment variables
In Netlify dashboard → Site settings → Environment variables, add:

| Key | Value |
|-----|-------|
| `GOOGLE_API_KEY` | Your Google API key |
| `SHEET_ID` | `1zR3LzKzEhbEyzvzwFj7u7ZwnDF6KkjKZM3l4SRXqnpQ` |

### 4. Redeploy
After setting env vars, go to Deploys → Trigger deploy → Deploy site.

Your dashboard will be live at `https://your-site-name.netlify.app`

## Sharing with your team
Just send them the Netlify URL. No login required.
To add a password, go to Netlify → Site settings → Access control → Password protection.

## Local development
Open `public/index.html` directly in a browser for UI preview.
For full Sheets integration locally, install Netlify CLI:
```
npm install -g netlify-cli
netlify dev
```
