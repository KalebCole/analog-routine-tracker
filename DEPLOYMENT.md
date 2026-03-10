# Deployment Guide — Azure

Step-by-step instructions to deploy Analog Routine Tracker to Azure.

## Architecture

```
Azure Static Web Apps  ←  Next.js frontend
        ↓
Azure App Service (B1) ←  Express API + Python (for PDF gen)
        ↓
    ┌───┴───┐
Neon PostgreSQL    Azure Blob Storage    Azure OpenAI (GPT-4o)
```

**Estimated cost:** $0–15/month (Neon free tier, App Service B1 ~$13/mo, Blob Storage pennies, OpenAI pay-per-use).

---

## Prerequisites

- Azure account with active subscription
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- [Neon](https://neon.tech) account (free tier)
- Node.js 20+ and npm

---

## 1. Provision Database (Neon)

1. Create a Neon project at https://console.neon.tech
2. Copy the connection string (PostgreSQL format)
3. Run migrations:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate
   ```
4. Seed initial routines:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:seed
   ```

---

## 2. Create Azure Resources

```bash
# Login
az login

# Create resource group
az group create --name rg-routine-tracker --location eastus

# Create App Service plan
az appservice plan create \
  --name plan-routine-tracker \
  --resource-group rg-routine-tracker \
  --sku B1 --is-linux

# Create Web App (API)
az webapp create \
  --name routine-tracker-api \
  --resource-group rg-routine-tracker \
  --plan plan-routine-tracker \
  --runtime "NODE:20-lts"

# Create Storage Account
az storage account create \
  --name routinetrackerstore \
  --resource-group rg-routine-tracker \
  --sku Standard_LRS

# Create blob containers
az storage container create --name photos --account-name routinetrackerstore
az storage container create --name pdfs --account-name routinetrackerstore
```

---

## 3. Deploy API

```bash
# Build
npm run build:api

# Set environment variables
az webapp config appsettings set \
  --name routine-tracker-api \
  --resource-group rg-routine-tracker \
  --settings \
    NODE_ENV=production \
    DATABASE_URL="postgresql://..." \
    AZURE_STORAGE_CONNECTION_STRING="..." \
    AZURE_OPENAI_ENDPOINT="https://..." \
    AZURE_OPENAI_KEY="..." \
    API_AUTH_TOKEN="$(openssl rand -hex 32)" \
    CORS_ORIGIN="https://your-frontend.azurestaticapps.net" \
    FRONTEND_URL="https://your-frontend.azurestaticapps.net"

# Deploy (from apps/api directory)
cd apps/api
zip -r deploy.zip dist/ package.json package-lock.json
az webapp deploy \
  --name routine-tracker-api \
  --resource-group rg-routine-tracker \
  --src-path deploy.zip --type zip
```

---

## 4. Deploy Frontend (Azure Static Web Apps)

```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Build frontend
NEXT_PUBLIC_API_URL=https://routine-tracker-api.azurewebsites.net \
NEXT_PUBLIC_AUTH_TOKEN=your-token-here \
npm run build:web

# Deploy
cd apps/web
swa deploy .next --env production
```

Or use GitHub Actions — Azure Static Web Apps provides a deploy action automatically when linked.

---

## 5. Configure Azure OpenAI (for OCR)

1. Create an Azure OpenAI resource in the Azure Portal
2. Deploy the `gpt-4o` model
3. Copy the endpoint and key to the API environment variables

---

## 6. Verify Deployment

```bash
# Health check
curl https://routine-tracker-api.azurewebsites.net/health

# Test auth
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://routine-tracker-api.azurewebsites.net/api/routines
```

---

## Environment Variables Reference

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `DATABASE_URL` | API | Yes | Neon PostgreSQL connection string |
| `AZURE_STORAGE_CONNECTION_STRING` | API | Yes | Azure Blob Storage |
| `AZURE_OPENAI_ENDPOINT` | API | For OCR | Azure OpenAI endpoint |
| `AZURE_OPENAI_KEY` | API | For OCR | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | API | For OCR | Model deployment name (default: gpt-4o) |
| `API_AUTH_TOKEN` | API | Prod | Bearer token shared secret |
| `NEXT_PUBLIC_AUTH_TOKEN` | Frontend | Prod | Same token as API_AUTH_TOKEN |
| `NEXT_PUBLIC_API_URL` | Frontend | Yes | API base URL |
| `CORS_ORIGIN` | API | Prod | Allowed frontend origin(s) |
| `FRONTEND_URL` | API | Prod | Frontend URL (for CORS fallback) |
| `TODOIST_API_TOKEN` | API | No | For paper inventory alerts |
| `PORT` | API | No | Server port (default: 3001) |
| `NODE_ENV` | API | No | Environment (default: development) |

---

## Troubleshooting

- **Build fails after upgrade:** Delete `node_modules` and `.next`, run `npm install && npm run build`
- **Auth errors (401/403):** Ensure `API_AUTH_TOKEN` and `NEXT_PUBLIC_AUTH_TOKEN` match exactly
- **CORS errors:** Set `CORS_ORIGIN` to your exact frontend URL (no trailing slash)
- **PDF generation fails:** Ensure Python 3 and `reportlab` are installed on the App Service
- **OCR not working:** Verify Azure OpenAI resource has GPT-4o deployed with vision capability
