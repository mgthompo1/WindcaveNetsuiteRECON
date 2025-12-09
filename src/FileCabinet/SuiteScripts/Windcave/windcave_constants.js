/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Windcave Settlement Integration - Constants Module
 * Contains all constant values used across the Windcave integration scripts.
 */
define([], function() {

    /**
     * Custom Record Type IDs
     */
    const RECORD_TYPES = {
        CONFIG: 'customrecord_windcave_config',
        SETTLEMENT: 'customrecord_windcave_settlement',
        TRANSACTION_DETAIL: 'customrecord_windcave_txn_detail'
    };

    /**
     * Configuration Record Field IDs
     */
    const CONFIG_FIELDS = {
        API_USERNAME: 'custrecord_wc_api_username',
        API_PASSWORD: 'custrecord_wc_api_key',
        MERCHANT_ID: 'custrecord_wc_merchant_id',
        CUSTOMER_ID: 'custrecord_wc_customer_id',
        ENVIRONMENT: 'custrecord_wc_environment',
        BANK_ACCOUNT: 'custrecord_wc_bank_account',
        LOOKBACK_DAYS: 'custrecord_wc_lookback_days',
        NOTIFICATION_EMAIL: 'custrecord_wc_notification_email',
        IS_ACTIVE: 'custrecord_wc_is_active'
    };

    /**
     * Settlement Record Field IDs
     */
    const SETTLEMENT_FIELDS = {
        SETTLEMENT_ID: 'custrecord_ws_settlement_id',
        SETTLEMENT_DATE: 'custrecord_ws_settlement_date',
        AMOUNT: 'custrecord_ws_amount',
        CURRENCY: 'custrecord_ws_currency',
        STATUS: 'custrecord_ws_status',
        CRDR: 'custrecord_ws_crdr',
        REFERENCE_NUMBER: 'custrecord_ws_reference_number',
        MERCHANT_ID: 'custrecord_ws_merchant_id',
        CUSTOMER_ID: 'custrecord_ws_customer_id',
        BANK_DEPOSIT: 'custrecord_ws_bank_deposit',
        PROCESSED: 'custrecord_ws_processed',
        MATCHED_COUNT: 'custrecord_ws_matched_count',
        UNMATCHED_COUNT: 'custrecord_ws_unmatched_count',
        MATCHED_AMOUNT: 'custrecord_ws_matched_amount',
        ERROR_MESSAGE: 'custrecord_ws_error_message',
        PROCESSED_DATE: 'custrecord_ws_processed_date'
    };

    /**
     * Transaction Detail Record Field IDs
     */
    const TXN_DETAIL_FIELDS = {
        PARENT_SETTLEMENT: 'custrecord_wtd_parent_settlement',
        TRANSACTION_ID: 'custrecord_wtd_transaction_id',
        MERCHANT_REFERENCE: 'custrecord_wtd_merchant_reference',
        AMOUNT: 'custrecord_wtd_amount',
        CURRENCY: 'custrecord_wtd_currency',
        TYPE: 'custrecord_wtd_type',
        METHOD: 'custrecord_wtd_method',
        AUTH_CODE: 'custrecord_wtd_auth_code',
        DATETIME_UTC: 'custrecord_wtd_datetime_utc',
        USERNAME: 'custrecord_wtd_username',
        NS_TRANSACTION: 'custrecord_wtd_ns_transaction',
        MATCHED: 'custrecord_wtd_matched',
        MATCH_ERROR: 'custrecord_wtd_match_error',
        IN_DEPOSIT: 'custrecord_wtd_in_deposit'
    };

    /**
     * Windcave API Configuration
     */
    const API = {
        BASE_URL_PROD: 'https://sec.windcave.com/api/v1',
        BASE_URL_UAT: 'https://uat.windcave.com/api/v1',
        ENDPOINTS: {
            SETTLEMENTS: '/settlements'
        },
        ENVIRONMENTS: {
            PRODUCTION: 'sec',
            UAT: 'uat'
        }
    };

    /**
     * Settlement Status Values from Windcave
     */
    const SETTLEMENT_STATUS = {
        PENDING: 'Pending',
        DONE: 'Done',
        VOID: 'Void'
    };

    /**
     * Credit/Debit Indicators
     */
    const CRDR = {
        CREDIT: 'CR',
        DEBIT: 'DR'
    };

    /**
     * Transaction Types from Windcave
     */
    const TRANSACTION_TYPES = {
        PURCHASE: 'Purchase',
        REFUND: 'Refund',
        AUTH: 'Auth',
        COMPLETE: 'Complete',
        VOID: 'Void'
    };

    /**
     * NetSuite Transaction Types for matching
     */
    const NS_TRANSACTION_TYPES = {
        CUSTOMER_PAYMENT: 'customerpayment',
        CASH_SALE: 'cashsale',
        SALES_ORDER: 'salesorder',
        CUSTOMER_REFUND: 'customerrefund'
    };

    /**
     * Error Messages
     */
    const ERRORS = {
        CONFIG_NOT_FOUND: 'Windcave configuration record not found',
        CONFIG_INACTIVE: 'Windcave configuration is inactive',
        API_AUTH_FAILED: 'Windcave API authentication failed',
        API_REQUEST_FAILED: 'Windcave API request failed',
        SETTLEMENT_ALREADY_PROCESSED: 'Settlement has already been processed',
        NO_MATCHING_PAYMENT: 'No matching NetSuite payment found',
        PAYMENT_ALREADY_DEPOSITED: 'Payment has already been deposited',
        AMOUNT_MISMATCH: 'Transaction amount does not match payment amount',
        CURRENCY_MISMATCH: 'Transaction currency does not match bank account currency'
    };

    /**
     * Email Template Subjects
     */
    const EMAIL = {
        SUBJECT_SUCCESS: 'Windcave Settlement Processing Complete',
        SUBJECT_ERROR: 'Windcave Settlement Processing - Errors Detected',
        AUTHOR_ID: -5 // System author, update as needed
    };

    /**
     * Miscellaneous Constants
     */
    const MISC = {
        DEFAULT_LOOKBACK_DAYS: 1,
        AMOUNT_TOLERANCE: 0.01, // Tolerance for amount matching (currency rounding)
        MAX_API_RETRIES: 3,
        RETRY_DELAY_MS: 1000
    };

    return {
        RECORD_TYPES,
        CONFIG_FIELDS,
        SETTLEMENT_FIELDS,
        TXN_DETAIL_FIELDS,
        API,
        SETTLEMENT_STATUS,
        CRDR,
        TRANSACTION_TYPES,
        NS_TRANSACTION_TYPES,
        ERRORS,
        EMAIL,
        MISC
    };
});
