# Releasing (Automatic)

This repo uses [Changesets](https://github.com/changesets/changesets) + GitHub Actions to auto version and publish to npm.

## One-time setup

### Step 1 — Create an npm token

1. Log in at [npmjs.com](https://www.npmjs.com)
2. Click your avatar (top right) → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Type: **Automation**
5. Copy the token

### Step 2 — Add token to GitHub

1. Go to this repo on GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: paste your token
4. Click **Add secret**

That's all the setup you ever need to do.

## Day-to-day workflow

For every change you want released:

```bash
yarn changeset        # describe what changed
git add .
git commit -m "..."
git push
```

Then merge your PR to `main`.

## What happens automatically

On merge to `main`, the GitHub Action will:

1. If there are pending changesets: open/update a PR called `chore: version packages`
2. When that PR is merged: bump `version` in `package.json`, publish to npm, and create a git tag

## Local development

`yarn link` is still fine for your local host app.
Railway and other deploys should use the npm version:

```json
"@activistchecklist/react-review-comments": "^0.1.2"
```
