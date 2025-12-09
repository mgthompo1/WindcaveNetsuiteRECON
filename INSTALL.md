# Windcave Settlement Reconciliation - Installation Guide

This guide provides multiple installation methods for the Windcave Settlement Reconciliation integration.

---

## Quick Start (Choose One Method)

| Method | Best For | Difficulty |
|--------|----------|------------|
| **Option A: SuiteCloud CLI (SDF)** | Developers with CLI access | Easy |
| **Option B: Manual Upload** | Administrators | Medium |
| **Option C: Bundle Import** | Quick deployment | Easiest |

---

## Option A: SuiteCloud CLI Installation (Recommended)

### Prerequisites
- Node.js 18+ installed
- NetSuite account with SuiteCloud Development Framework enabled
- Administrator role

### Step 1: Install SuiteCloud CLI
```bash
npm install -g @oracle/suitecloud-cli
```

### Step 2: Setup Authentication
```bash
cd /path/to/SuiteScripts/Windcave/src
suitecloud account:setup
```
Follow the prompts to authenticate with your NetSuite account.

### Step 3: Validate the Project
```bash
suitecloud project:validate
```

### Step 4: Deploy to NetSuite
```bash
suitecloud project:deploy
```

### Step 5: Configure
1. Go to **Lists > Custom > Windcave Configuration > New**
2. Fill in your Windcave API credentials
3. Save

---

## Option B: Manual Upload Installation

### Step 1: Upload Script Files

1. Log into NetSuite as Administrator
2. Go to **Documents > Files > File Cabinet**
3. Navigate to **SuiteScripts** folder (create if needed)
4. Create a new folder called **Windcave**
5. Upload all `.js` files:
   - `windcave_constants.js`
   - `windcave_api_module.js`
   - `windcave_reconciliation_lib.js`
   - `windcave_settlement_scheduled.js`
   - `windcave_settlement_suitelet.js`
   - `windcave_settlement_client.js`

### Step 2: Create Custom Records

#### 2.1 Windcave Configuration Record
1. Go to **Customization > Lists, Records, & Fields > Record Types > New**
2. Enter:
   - **Label:** Windcave Configuration
   - **ID:** `_windcave_config` (NetSuite will prefix with `customrecord`)
3. Click **Save**
4. Add the following fields (click **New Field** for each):

| Field Label | ID | Type | Mandatory |
|-------------|-----|------|-----------|
| API Username | `_wc_api_username` | Free-Form Text | Yes |
| API Password | `_wc_api_password` | Password | Yes |
| Merchant ID | `_wc_merchant_id` | Free-Form Text | Yes |
| Customer ID | `_wc_customer_id` | Free-Form Text | No |
| Environment | `_wc_environment` | List (create: sec, uat) | Yes |
| Bank Account | `_wc_bank_account` | List/Record (Account) | Yes |
| Lookback Days | `_wc_lookback_days` | Integer (default: 1) | No |
| Notification Email | `_wc_notification_email` | Email | No |
| Active | `_wc_is_active` | Checkbox (default: checked) | No |

#### 2.2 Windcave Settlement Record
1. Go to **Customization > Lists, Records, & Fields > Record Types > New**
2. Enter:
   - **Label:** Windcave Settlement
   - **ID:** `_windcave_settlement`
3. Click **Save**
4. Add the following fields:

| Field Label | ID | Type | Mandatory |
|-------------|-----|------|-----------|
| Settlement ID | `_ws_settlement_id` | Free-Form Text | Yes |
| Settlement Date | `_ws_settlement_date` | Date | Yes |
| Amount | `_ws_amount` | Currency | Yes |
| Currency | `_ws_currency` | Free-Form Text | Yes |
| Windcave Status | `_ws_status` | Free-Form Text | Yes |
| CR/DR | `_ws_crdr` | Free-Form Text | Yes |
| Reference Number | `_ws_reference_number` | Free-Form Text | No |
| Merchant ID | `_ws_merchant_id` | Free-Form Text | Yes |
| Customer ID | `_ws_customer_id` | Free-Form Text | No |
| Bank Deposit | `_ws_bank_deposit` | List/Record (Deposit) | No |
| Processed | `_ws_processed` | Checkbox | No |
| Matched Transactions | `_ws_matched_count` | Integer | No |
| Unmatched Transactions | `_ws_unmatched_count` | Integer | No |
| Matched Amount | `_ws_matched_amount` | Currency | No |
| Error Message | `_ws_error_message` | Text Area | No |
| Processed Date | `_ws_processed_date` | Date/Time | No |

#### 2.3 Windcave Transaction Detail Record
1. Go to **Customization > Lists, Records, & Fields > Record Types > New**
2. Enter:
   - **Label:** Windcave Transaction Detail
   - **ID:** `_windcave_txn_detail`
3. Click **Save**
4. Add the following fields:

| Field Label | ID | Type | Mandatory |
|-------------|-----|------|-----------|
| Parent Settlement | `_wtd_parent_settlement` | List/Record (Windcave Settlement) | Yes |
| Transaction ID | `_wtd_transaction_id` | Free-Form Text | Yes |
| Merchant Reference | `_wtd_merchant_reference` | Free-Form Text | No |
| Amount | `_wtd_amount` | Currency | Yes |
| Currency | `_wtd_currency` | Free-Form Text | Yes |
| Transaction Type | `_wtd_type` | Free-Form Text | Yes |
| Payment Method | `_wtd_method` | Free-Form Text | No |
| Auth Code | `_wtd_auth_code` | Free-Form Text | No |
| Transaction DateTime | `_wtd_datetime_utc` | Date/Time | No |
| API Username | `_wtd_username` | Free-Form Text | No |
| NetSuite Transaction | `_wtd_ns_transaction` | List/Record (Transaction) | No |
| Matched | `_wtd_matched` | Checkbox | No |
| Match Error | `_wtd_match_error` | Text Area | No |
| Included in Deposit | `_wtd_in_deposit` | Checkbox | No |

### Step 3: Create Script Records

#### 3.1 Scheduled Script
1. Go to **Customization > Scripting > Scripts > New**
2. Select the file: `windcave_settlement_scheduled.js`
3. Click **Create Script Record**
4. Enter:
   - **Name:** Windcave Settlement Scheduled
   - **ID:** `_windcave_settlement_ss`
5. Click **Save**
6. Click **Deploy Script**
7. Configure deployment:
   - **Title:** Windcave Settlement Daily
   - **ID:** `_windcave_settlement_ss`
   - **Status:** Scheduled
   - **Schedule:** Daily at 6:00 AM (or your preferred time)
   - **Execute As Role:** Administrator
8. Click **Save**

#### 3.2 Suitelet
1. Go to **Customization > Scripting > Scripts > New**
2. Select the file: `windcave_settlement_suitelet.js`
3. Click **Create Script Record**
4. Enter:
   - **Name:** Windcave Settlement Dashboard
   - **ID:** `_windcave_settlement_sl`
5. Click **Save**
6. Click **Deploy Script**
7. Configure deployment:
   - **Title:** Windcave Settlement Dashboard
   - **ID:** `_windcave_settlement_sl`
   - **Status:** Released
   - **Audience > Roles:** Select roles that need access
8. Click **Save**
9. Copy the **External URL** for dashboard access

### Step 4: Create Configuration

1. Go to **Lists > Custom > Windcave Configuration > New**
2. Fill in:
   - **API Username:** Your Windcave REST API username
   - **API Password:** Your Windcave REST API password
   - **Merchant ID:** Your Windcave Merchant ID
   - **Environment:** Production (sec) or UAT (uat)
   - **Bank Account:** Select your bank account for Windcave deposits
   - **Lookback Days:** 1 (default)
   - **Notification Email:** Your email for daily summaries
   - **Active:** Checked
3. Click **Save**

---

## Option C: Bundle Import

### Coming Soon
A SuiteBundle package will be available for one-click installation.

---

## Post-Installation Setup

### 1. Add Dashboard Link (Optional)
1. Go to **Customization > Centers and Tabs > Center Links**
2. Click **New**
3. Configure:
   - **Label:** Windcave Settlements
   - **Center:** Transactions (or your preferred center)
   - **Link Type:** Suitelet
   - **Suitelet:** Windcave Settlement Dashboard
4. Click **Save**

### 2. Test the Integration
1. Access the dashboard via the Suitelet URL
2. Verify configuration status shows green
3. Try a manual fetch for yesterday's date
4. Check the scheduled script is set up correctly

### 3. Verify Permissions
Ensure the execution role has:
- Custom Record: Full access to all Windcave custom records
- Bank Deposit: Create, Edit
- Customer Payment: View
- Cash Sale: View
- Transactions: View

---

## Troubleshooting Installation

### "Script file not found"
- Verify the script files are uploaded to `/SuiteScripts/Windcave/`
- Check file names match exactly (case-sensitive)

### "Custom record not found"
- Verify all three custom records are created
- Check the Script IDs match exactly:
  - `customrecord_windcave_config`
  - `customrecord_windcave_settlement`
  - `customrecord_windcave_txn_detail`

### "Module not found" errors
- Ensure all `.js` files are in the same folder
- Verify the module paths in the scripts match your folder structure

### Scheduled script not running
- Check the deployment status is "Scheduled"
- Verify the schedule is configured correctly
- Check script execution logs for errors

---

## Updating the Integration

To update to a new version:
1. Upload the new script files (overwrite existing)
2. The custom records do not need to be modified unless specified in release notes
3. Clear script cache if needed: **Setup > Scripting > Scripted Records > Clear Cache**

---

## Uninstalling

To remove the integration:
1. Delete the script deployments
2. Delete the script records
3. Delete the Windcave Transaction Detail records (if any data exists)
4. Delete the Windcave Settlement records (if any data exists)
5. Delete the Windcave Configuration record
6. Delete the three custom record types
7. Delete the script files from File Cabinet
