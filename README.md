# Windcave Settlement Reconciliation for NetSuite

Automated integration to fetch Windcave payment processor settlements and create Bank Deposits in NetSuite for reconciliation.

## Features

- **Daily Automated Processing**: Scheduled script runs daily to fetch settlements from Windcave
- **Multi-Configuration Support**: Support for multiple Windcave merchant accounts with separate API credentials
- **Transaction Matching**: Automatically matches Windcave transactions to NetSuite payments using the merchant reference (internal ID)
- **Bank Deposit Creation**: Creates Bank Deposit records to clear Undeposited Funds
- **Dashboard UI**: Suitelet interface for viewing settlements, filtering by date, and manual processing
- **Email Notifications**: Daily summary emails with processing results and errors
- **Duplicate Prevention**: Tracks processed settlements to prevent reprocessing

## Quick Install (SuiteCloud CLI)

### Prerequisites

- Node.js 18+ installed
- NetSuite Administrator access
- SuiteCloud Development Framework (SDF) enabled in your NetSuite account

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/mgthompo1/WindcaveNetsuiteRECON.git
cd WindcaveNetsuiteRECON

# 2. Install dependencies
npm install

# 3. Setup NetSuite authentication (opens browser for OAuth)
npm run setup

# 4. Deploy to NetSuite
npm run deploy

# 5. Create configuration record in NetSuite (see Configuration section below)
```

## Configuration

After deployment, create a Windcave Configuration record in NetSuite:

1. Go to **Lists > Custom > Windcave Configuration > New**
2. Fill in the following fields:

| Field | Description | Required |
|-------|-------------|----------|
| **API Username** | Windcave REST API username | Yes |
| **API Key** | Windcave REST API key/password | Yes |
| **Merchant ID** | Your Windcave Merchant ID | Yes |
| **Customer ID** | Windcave Customer ID (leave empty unless querying multiple merchants) | No |
| **Environment** | `sec` for Production, `uat` for UAT/Testing | Yes |
| **Bank Account** | NetSuite Bank Account for deposits | Yes |
| **Lookback Days** | Days to look back for settlements (default: 1) | No |
| **Notification Email** | Email for daily summary reports | No |
| **Active** | Enable/disable processing | No |

3. Click **Save**

### Multiple Merchant Accounts

To process multiple Windcave merchant accounts, simply create additional configuration records with different API credentials and Merchant IDs. The scheduled script will process all active configurations.

## Accessing the Dashboard

### Option 1: Direct URL

Navigate to:
```
https://[ACCOUNT-ID].app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_windcave_settlement_sl&deploy=customdeploy_windcave_settlement_sl
```

### Option 2: Add Menu Link (Recommended)

1. Go to **Customization > Centers and Tabs > Center Links**
2. Click **New**
3. Fill in:
   - **Label**: `Windcave Settlements`
   - **Center**: Select `Transactions` or `Reports`
   - **Category**: Select appropriate category (e.g., `Banking`)
   - **Link Type**: `Suitelet`
   - **Script**: `Windcave Settlement Dashboard`
   - **Deployment**: `Windcave Settlement Dashboard`
4. Click **Save**

The link will now appear in your selected menu.

### Option 3: Script Deployment URL

1. Go to **Customization > Scripting > Script Deployments**
2. Find **Windcave Settlement Dashboard**
3. Click on it and copy the **External URL**

## Dashboard Features

- **Configuration Status**: View all active Windcave configurations
- **Date Filtering**: Filter settlements by date range
- **Manual Fetch**: Manually trigger settlement fetch for specific dates and configurations
- **Settlement List**: View all processed settlements with:
  - Settlement details (ID, date, amount, status)
  - Match counts (matched vs unmatched transactions)
  - Links to created Bank Deposits
- **Settlement Details**: Drill into individual settlements to view all transactions

## How It Works

### Daily Processing Flow

1. **Scheduled Script Runs** (default: 6 AM UTC daily)
2. **Load Configurations**: Fetches all active Windcave configuration records
3. **For Each Configuration**:
   - Call Windcave Settlement Search API for the configured lookback period
   - For each settlement with status "Done":
     - Check if already processed (skip duplicates)
     - Fetch detailed transactions via Settlement Query API
     - Create Windcave Settlement record
     - Match transactions to NetSuite payments
     - Create Bank Deposit for matched payments
     - Send notification email with results

### Transaction Matching

Transactions are matched using the `merchantReference` field from Windcave, which should contain the NetSuite transaction internal ID:

```
Windcave Transaction          NetSuite Payment
merchantReference: "12345" -> Internal ID: 12345 (Customer Payment)
```

### Supported Transaction Types

- Customer Payments
- Cash Sales
- Sales Orders (with payment)

## File Structure

```
/WindcaveNetsuiteRECON/
├── src/                              # SDF project folder
│   ├── FileCabinet/
│   │   └── SuiteScripts/
│   │       └── Windcave/
│   │           ├── windcave_constants.js
│   │           ├── windcave_api_module.js
│   │           ├── windcave_reconciliation_lib.js
│   │           ├── windcave_settlement_scheduled.js
│   │           ├── windcave_settlement_suitelet.js
│   │           └── windcave_settlement_client.js
│   ├── Objects/
│   │   ├── customrecord_windcave_config.xml
│   │   ├── customrecord_windcave_settlement.xml
│   │   ├── customrecord_windcave_txn_detail.xml
│   │   ├── customscript_windcave_settlement_sl.xml
│   │   └── customscript_windcave_settlement_ss.xml
│   ├── manifest.xml
│   └── deploy.xml
├── windcave_constants.js             # Source files (same as in src/)
├── windcave_api_module.js
├── windcave_reconciliation_lib.js
├── windcave_settlement_scheduled.js
├── windcave_settlement_suitelet.js
├── windcave_settlement_client.js
├── package.json
├── project.json
├── INSTALL.md
└── README.md
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Configure NetSuite authentication |
| `npm run validate` | Validate project before deployment |
| `npm run deploy` | Deploy to NetSuite |
| `npm run deploy:preview` | Preview deployment (dry run) |

## Troubleshooting

### Common Issues

1. **"Configuration not found" error**
   - Create a Windcave Configuration record
   - Ensure "Active" is checked

2. **"API authentication failed" (403 error)**
   - Verify API username and key are correct
   - Check environment setting matches your credentials (sec vs uat)
   - Ensure the API Key field has the full key (not masked)

3. **Transactions not matching**
   - Verify merchantReference in Windcave contains NetSuite internal ID
   - Check payment exists and is in Undeposited Funds
   - Verify amounts match (within $0.01 tolerance)

4. **Bank Deposit not created**
   - Ensure at least one transaction matched
   - Check settlement is Credit (CR), not Debit (DR)
   - Verify bank account is configured

5. **"Invalid date value" error**
   - This was fixed in the latest version - redeploy to update

### Viewing Logs

1. Go to **Customization > Scripting > Script Execution Logs**
2. Filter by Script: "Windcave Settlement"
3. View DEBUG, AUDIT, and ERROR level logs

## API Reference

### Windcave Settlement API

| Environment | Base URL |
|-------------|----------|
| Production | `https://sec.windcave.com/api/v1/` |
| UAT | `https://uat.windcave.com/api/v1/` |

**Endpoints Used:**
- `GET /settlements` - Search for settlements by date range
- `GET /settlements/{id}` - Get settlement details with transactions

**Authentication:** HTTP Basic Auth

For full Windcave API documentation: https://px5.docs.apiary.io/

## Custom Records Created

### Windcave Configuration (`customrecord_windcave_config`)
Stores API credentials and settings for each merchant account.

### Windcave Settlement (`customrecord_windcave_settlement`)
Tracks processed settlements with match counts and links to Bank Deposits.

### Windcave Transaction Detail (`customrecord_windcave_txn_detail`)
Individual transaction details within each settlement.

## License

MIT License

## Support

For issues with this integration:
1. Check the script execution logs
2. Review the dashboard for unmatched transactions
3. Verify Windcave API credentials and connectivity
4. Open an issue on GitHub
