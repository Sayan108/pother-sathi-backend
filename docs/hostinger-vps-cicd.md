# Hostinger VPS CI/CD

This project deploys to a Hostinger VPS from GitHub Actions over SSH. The workflow builds the TypeScript app, runs tests, uploads a release archive, installs production dependencies on the server, and restarts the app with PM2.

## VPS prerequisites

Install Node.js 20+, npm, Git, and PM2 on the VPS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
```

Create the deploy directory:

```bash
sudo mkdir -p /var/www/pothersathi-backend
sudo chown -R "$USER":"$USER" /var/www/pothersathi-backend
```

Create an SSH key for GitHub Actions and add the public key to `~/.ssh/authorized_keys` on the VPS.

## GitHub repository secrets

Add these secrets in GitHub under `Settings > Secrets and variables > Actions`:

| Secret | Description |
| --- | --- |
| `VPS_HOST` | VPS IP address or hostname |
| `VPS_USER` | SSH user used for deployment |
| `VPS_SSH_KEY` | Private SSH key matching the VPS public key |
| `VPS_PORT` | SSH port, optional, defaults to `22` |
| `VPS_DEPLOY_PATH` | Deploy path, optional, defaults to `/var/www/pothersathi-backend` |
| `HEALTHCHECK_URL` | Public health URL, optional, for example `https://api.pathersathi.cloud/health` |

Generate a deploy key locally:

```bash
ssh-keygen -t ed25519 -C "github-actions-pothersathi" -f ./pothersathi_deploy_key
```

Add the public key to the VPS:

```bash
cat ./pothersathi_deploy_key.pub
```

Paste that output into `~/.ssh/authorized_keys` on the VPS:

```bash
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Add the private key content as the GitHub `VPS_SSH_KEY` secret:

```bash
cat ./pothersathi_deploy_key
```

## First deployment

Push to `main` or `master`, or run `Deploy to Hostinger VPS` manually from the GitHub Actions tab.

On the first run, the workflow creates:

```text
/var/www/pothersathi-backend/shared/.env
```

It copies the template from `.env.example` and stops. SSH into the VPS, fill in production values, then rerun the workflow.

Important production values include:

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
FRONTEND_URL=...
CORS_ORIGINS=...
```

## Nginx reverse proxy

Use Nginx to serve the API on your domain and forward traffic to the Node process:

```nginx
server {
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After enabling the site, install an SSL certificate:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

## Useful PM2 commands

```bash
pm2 status
pm2 logs pothersathi-backend
pm2 restart pothersathi-backend
pm2 save
```

## Deployment checks

The workflow verifies the app locally on the VPS after PM2 restarts it:

```bash
curl http://127.0.0.1:5000/health
```

If `HEALTHCHECK_URL` is configured, GitHub Actions also checks the public API URL after deployment. For this project use:

```text
https://api.pathersathi.cloud/health
```
