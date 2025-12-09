/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Windcave Settlement Integration - Reconciliation Library
 * Handles matching Windcave transactions to NetSuite payments and creating Bank Deposits.
 */
define(['N/record', 'N/search', 'N/log', 'N/format', './windcave_constants'],
    function(record, search, log, format, constants) {

        const MODULE_NAME = 'WindcaveReconciliation';

        /**
         * Loads all active Windcave configuration records
         * @returns {Array} Array of configuration objects
         * @throws {Error} If no configurations found
         */
        function loadAllConfigurations() {
            const configSearch = search.create({
                type: constants.RECORD_TYPES.CONFIG,
                filters: [
                    [constants.CONFIG_FIELDS.IS_ACTIVE, 'is', 'T']
                ],
                columns: [
                    constants.CONFIG_FIELDS.API_USERNAME,
                    constants.CONFIG_FIELDS.API_PASSWORD,
                    constants.CONFIG_FIELDS.MERCHANT_ID,
                    constants.CONFIG_FIELDS.CUSTOMER_ID,
                    constants.CONFIG_FIELDS.ENVIRONMENT,
                    constants.CONFIG_FIELDS.BANK_ACCOUNT,
                    constants.CONFIG_FIELDS.LOOKBACK_DAYS,
                    constants.CONFIG_FIELDS.NOTIFICATION_EMAIL
                ]
            });

            const configurations = [];
            configSearch.run().each(function(result) {
                const merchantId = result.getValue(constants.CONFIG_FIELDS.MERCHANT_ID);
                configurations.push({
                    internalId: result.id,
                    name: 'Config #' + result.id + ' (' + merchantId + ')',
                    apiUsername: result.getValue(constants.CONFIG_FIELDS.API_USERNAME),
                    apiPassword: result.getValue(constants.CONFIG_FIELDS.API_PASSWORD),
                    merchantId: merchantId,
                    customerId: result.getValue(constants.CONFIG_FIELDS.CUSTOMER_ID),
                    environment: result.getValue(constants.CONFIG_FIELDS.ENVIRONMENT),
                    bankAccount: result.getValue(constants.CONFIG_FIELDS.BANK_ACCOUNT),
                    bankAccountText: result.getText(constants.CONFIG_FIELDS.BANK_ACCOUNT),
                    lookbackDays: parseInt(result.getValue(constants.CONFIG_FIELDS.LOOKBACK_DAYS)) || constants.MISC.DEFAULT_LOOKBACK_DAYS,
                    notificationEmail: result.getValue(constants.CONFIG_FIELDS.NOTIFICATION_EMAIL)
                });
                return true; // Continue iterating
            });

            if (configurations.length === 0) {
                throw new Error(constants.ERRORS.CONFIG_NOT_FOUND);
            }

            return configurations;
        }

        /**
         * Loads a single Windcave configuration (first active one found)
         * For backwards compatibility
         * @returns {Object} Configuration values
         * @throws {Error} If configuration not found or inactive
         */
        function loadConfiguration() {
            const configs = loadAllConfigurations();
            return configs[0];
        }

        /**
         * Loads a specific configuration by internal ID
         * @param {number} configId - Internal ID of configuration record
         * @returns {Object} Configuration values
         * @throws {Error} If configuration not found
         */
        function loadConfigurationById(configId) {
            try {
                const configRecord = record.load({
                    type: constants.RECORD_TYPES.CONFIG,
                    id: configId
                });

                const merchantId = configRecord.getValue(constants.CONFIG_FIELDS.MERCHANT_ID);
                return {
                    internalId: configId,
                    name: 'Config #' + configId + ' (' + merchantId + ')',
                    apiUsername: configRecord.getValue(constants.CONFIG_FIELDS.API_USERNAME),
                    apiPassword: configRecord.getValue(constants.CONFIG_FIELDS.API_PASSWORD),
                    merchantId: configRecord.getValue(constants.CONFIG_FIELDS.MERCHANT_ID),
                    customerId: configRecord.getValue(constants.CONFIG_FIELDS.CUSTOMER_ID),
                    environment: configRecord.getValue(constants.CONFIG_FIELDS.ENVIRONMENT),
                    bankAccount: configRecord.getValue(constants.CONFIG_FIELDS.BANK_ACCOUNT),
                    bankAccountText: configRecord.getText(constants.CONFIG_FIELDS.BANK_ACCOUNT),
                    lookbackDays: parseInt(configRecord.getValue(constants.CONFIG_FIELDS.LOOKBACK_DAYS)) || constants.MISC.DEFAULT_LOOKBACK_DAYS,
                    notificationEmail: configRecord.getValue(constants.CONFIG_FIELDS.NOTIFICATION_EMAIL),
                    isActive: configRecord.getValue(constants.CONFIG_FIELDS.IS_ACTIVE)
                };
            } catch (e) {
                log.error({
                    title: MODULE_NAME + '.loadConfigurationById',
                    details: 'Error loading configuration ' + configId + ': ' + e.message
                });
                throw new Error('Configuration not found: ' + configId);
            }
        }

        /**
         * Checks if a settlement has already been processed
         * @param {string} settlementId - Windcave settlement ID
         * @returns {boolean} True if already processed
         */
        function isSettlementProcessed(settlementId) {
            const existingSearch = search.create({
                type: constants.RECORD_TYPES.SETTLEMENT,
                filters: [
                    [constants.SETTLEMENT_FIELDS.SETTLEMENT_ID, 'is', settlementId]
                ],
                columns: ['internalid']
            });

            const results = existingSearch.run().getRange({ start: 0, end: 1 });
            return results && results.length > 0;
        }

        /**
         * Creates a Windcave Settlement record
         * @param {Object} settlementData - Settlement data from API
         * @returns {number} Internal ID of created record
         */
        function createSettlementRecord(settlementData) {
            const settlementRecord = record.create({
                type: constants.RECORD_TYPES.SETTLEMENT,
                isDynamic: true
            });

            // Set the Name field (required by custom record)
            settlementRecord.setValue({
                fieldId: 'name',
                value: settlementData.id + ' - ' + settlementData.settlementDate
            });

            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.SETTLEMENT_ID,
                value: settlementData.id
            });
            // Parse ISO date (YYYY-MM-DD) to JavaScript Date then to NetSuite date
            const settlementDateParts = settlementData.settlementDate.split('-');
            const settlementDateObj = new Date(
                parseInt(settlementDateParts[0]),
                parseInt(settlementDateParts[1]) - 1,
                parseInt(settlementDateParts[2])
            );
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.SETTLEMENT_DATE,
                value: settlementDateObj
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.AMOUNT,
                value: parseFloat(settlementData.amount)
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.CURRENCY,
                value: settlementData.currency
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.STATUS,
                value: settlementData.status
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.CRDR,
                value: settlementData.CRDR
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.REFERENCE_NUMBER,
                value: settlementData.referenceNumber || ''
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.MERCHANT_ID,
                value: settlementData.merchantId
            });
            settlementRecord.setValue({
                fieldId: constants.SETTLEMENT_FIELDS.CUSTOMER_ID,
                value: settlementData.customerId || ''
            });

            const internalId = settlementRecord.save();

            log.audit({
                title: MODULE_NAME + '.createSettlementRecord',
                details: 'Created settlement record: ' + internalId + ' for Windcave ID: ' + settlementData.id
            });

            return internalId;
        }

        /**
         * Creates a Windcave Transaction Detail record
         * @param {Object} transactionData - Transaction data from API
         * @param {number} settlementInternalId - Parent settlement record internal ID
         * @returns {number} Internal ID of created record
         */
        function createTransactionDetailRecord(transactionData, settlementInternalId) {
            const txnRecord = record.create({
                type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                isDynamic: true
            });

            // Set the Name field (required by custom record)
            txnRecord.setValue({
                fieldId: 'name',
                value: transactionData.id + ' - ' + (transactionData.merchantReference || 'No Ref')
            });

            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT,
                value: settlementInternalId
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.TRANSACTION_ID,
                value: transactionData.id
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.MERCHANT_REFERENCE,
                value: transactionData.merchantReference || ''
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.AMOUNT,
                value: parseFloat(transactionData.amount)
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.CURRENCY,
                value: transactionData.currency
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.TYPE,
                value: transactionData.type
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.METHOD,
                value: transactionData.method || ''
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.AUTH_CODE,
                value: transactionData.authCode || ''
            });
            txnRecord.setValue({
                fieldId: constants.TXN_DETAIL_FIELDS.USERNAME,
                value: transactionData.username || ''
            });

            if (transactionData.dateTimeUtc) {
                txnRecord.setValue({
                    fieldId: constants.TXN_DETAIL_FIELDS.DATETIME_UTC,
                    value: new Date(transactionData.dateTimeUtc)
                });
            }

            return txnRecord.save();
        }

        /**
         * Finds a NetSuite payment/transaction by internal ID
         * @param {string} internalId - NetSuite internal ID from merchantReference
         * @returns {Object|null} Transaction info or null if not found
         */
        function findNetSuiteTransaction(internalId) {
            if (!internalId || internalId.trim() === '') {
                return null;
            }

            // Clean the internal ID (remove any non-numeric characters)
            const cleanId = internalId.replace(/\D/g, '');
            if (!cleanId) {
                return null;
            }

            try {
                // Search for the transaction across supported types
                const txnSearch = search.create({
                    type: search.Type.TRANSACTION,
                    filters: [
                        ['internalid', 'is', cleanId],
                        'AND',
                        ['mainline', 'is', 'T'],
                        'AND',
                        [
                            ['type', 'anyof', 'CustPymt'],
                            'OR',
                            ['type', 'anyof', 'CashSale']
                        ]
                    ],
                    columns: [
                        'internalid',
                        'type',
                        'tranid',
                        'amount',
                        'currency',
                        'status',
                        'undepfunds'
                    ]
                });

                const results = txnSearch.run().getRange({ start: 0, end: 1 });

                if (!results || results.length === 0) {
                    log.debug({
                        title: MODULE_NAME + '.findNetSuiteTransaction',
                        details: 'No transaction found for ID: ' + cleanId
                    });
                    return null;
                }

                const result = results[0];
                return {
                    internalId: result.getValue('internalid'),
                    type: result.getValue('type'),
                    tranId: result.getValue('tranid'),
                    amount: parseFloat(result.getValue('amount')),
                    currency: result.getText('currency'),
                    status: result.getValue('status'),
                    undepositedFunds: result.getValue('undepfunds')
                };

            } catch (e) {
                log.error({
                    title: MODULE_NAME + '.findNetSuiteTransaction',
                    details: 'Error searching for transaction ' + cleanId + ': ' + e.message
                });
                return null;
            }
        }

        /**
         * Validates that a payment can be added to a bank deposit
         * @param {Object} nsTransaction - NetSuite transaction info
         * @param {Object} windcaveTxn - Windcave transaction data
         * @returns {Object} Validation result with isValid and error properties
         */
        function validatePaymentForDeposit(nsTransaction, windcaveTxn) {
            if (!nsTransaction) {
                return {
                    isValid: false,
                    error: constants.ERRORS.NO_MATCHING_PAYMENT
                };
            }

            // Check if already deposited (undepfunds = 'F' means already deposited)
            if (nsTransaction.undepositedFunds === 'F') {
                return {
                    isValid: false,
                    error: constants.ERRORS.PAYMENT_ALREADY_DEPOSITED
                };
            }

            // Validate amount matches (within tolerance)
            const windcaveAmount = parseFloat(windcaveTxn.amount);
            const amountDiff = Math.abs(nsTransaction.amount - windcaveAmount);

            if (amountDiff > constants.MISC.AMOUNT_TOLERANCE) {
                return {
                    isValid: false,
                    error: constants.ERRORS.AMOUNT_MISMATCH +
                           ' (NS: ' + nsTransaction.amount + ', WC: ' + windcaveAmount + ')'
                };
            }

            return { isValid: true, error: null };
        }

        /**
         * Matches Windcave transactions to NetSuite payments
         * @param {Array} transactions - Windcave transactions from settlement
         * @param {number} settlementInternalId - Settlement record internal ID
         * @returns {Object} Match results with matched/unmatched arrays
         */
        function matchTransactions(transactions, settlementInternalId) {
            const matched = [];
            const unmatched = [];

            for (const txn of transactions) {
                // Create transaction detail record
                const txnDetailId = createTransactionDetailRecord(txn, settlementInternalId);

                // Skip refunds for bank deposit (they need different handling)
                if (txn.type === constants.TRANSACTION_TYPES.REFUND) {
                    log.audit({
                        title: MODULE_NAME + '.matchTransactions',
                        details: 'Skipping refund transaction: ' + txn.id
                    });
                    unmatched.push({
                        txnDetailId: txnDetailId,
                        windcaveTxn: txn,
                        error: 'Refund transactions require manual handling'
                    });
                    continue;
                }

                // Find matching NetSuite transaction
                const nsTransaction = findNetSuiteTransaction(txn.merchantReference);
                const validation = validatePaymentForDeposit(nsTransaction, txn);

                if (validation.isValid) {
                    // Update transaction detail with match
                    record.submitFields({
                        type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                        id: txnDetailId,
                        values: {
                            [constants.TXN_DETAIL_FIELDS.NS_TRANSACTION]: nsTransaction.internalId,
                            [constants.TXN_DETAIL_FIELDS.MATCHED]: true
                        }
                    });

                    matched.push({
                        txnDetailId: txnDetailId,
                        windcaveTxn: txn,
                        nsTransaction: nsTransaction
                    });

                    log.debug({
                        title: MODULE_NAME + '.matchTransactions',
                        details: 'Matched WC txn ' + txn.id + ' to NS txn ' + nsTransaction.internalId
                    });

                } else {
                    // Update transaction detail with error
                    record.submitFields({
                        type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                        id: txnDetailId,
                        values: {
                            [constants.TXN_DETAIL_FIELDS.MATCH_ERROR]: validation.error
                        }
                    });

                    unmatched.push({
                        txnDetailId: txnDetailId,
                        windcaveTxn: txn,
                        error: validation.error
                    });

                    log.debug({
                        title: MODULE_NAME + '.matchTransactions',
                        details: 'Failed to match WC txn ' + txn.id + ': ' + validation.error
                    });
                }
            }

            return { matched, unmatched };
        }

        /**
         * Creates a Bank Deposit record for matched payments
         * @param {Object} options - Deposit options
         * @param {Object} options.settlementData - Settlement data from API
         * @param {Array} options.matchedTransactions - Successfully matched transactions
         * @param {number} options.bankAccountId - Bank account internal ID
         * @returns {number|null} Bank Deposit internal ID or null if no valid payments
         */
        function createBankDeposit(options) {
            const { settlementData, matchedTransactions, bankAccountId } = options;

            if (!matchedTransactions || matchedTransactions.length === 0) {
                log.audit({
                    title: MODULE_NAME + '.createBankDeposit',
                    details: 'No matched transactions to deposit'
                });
                return null;
            }

            try {
                const depositRecord = record.create({
                    type: record.Type.DEPOSIT,
                    isDynamic: true
                });

                // Set header fields
                depositRecord.setValue({
                    fieldId: 'account',
                    value: bankAccountId
                });

                // Parse ISO date (YYYY-MM-DD) to JavaScript Date
                const depDateParts = settlementData.settlementDate.split('-');
                const depDateObj = new Date(
                    parseInt(depDateParts[0]),
                    parseInt(depDateParts[1]) - 1,
                    parseInt(depDateParts[2])
                );
                depositRecord.setValue({
                    fieldId: 'trandate',
                    value: depDateObj
                });

                depositRecord.setValue({
                    fieldId: 'memo',
                    value: 'Windcave Settlement ' + settlementData.referenceNumber + ' (' + settlementData.id + ')'
                });

                // Add each matched payment to the deposit
                let paymentsAdded = 0;
                const lineCount = depositRecord.getLineCount({ sublistId: 'payment' });

                for (let i = 0; i < lineCount; i++) {
                    const paymentId = depositRecord.getSublistValue({
                        sublistId: 'payment',
                        fieldId: 'id',
                        line: i
                    });

                    // Check if this payment is in our matched list
                    const matchedTxn = matchedTransactions.find(m =>
                        m.nsTransaction && m.nsTransaction.internalId == paymentId
                    );

                    if (matchedTxn) {
                        depositRecord.selectLine({
                            sublistId: 'payment',
                            line: i
                        });
                        depositRecord.setCurrentSublistValue({
                            sublistId: 'payment',
                            fieldId: 'deposit',
                            value: true
                        });
                        depositRecord.commitLine({
                            sublistId: 'payment'
                        });
                        paymentsAdded++;

                        // Track which transactions were added to this deposit
                        if (!depositRecord._addedTxnDetailIds) {
                            depositRecord._addedTxnDetailIds = [];
                        }
                        depositRecord._addedTxnDetailIds.push(matchedTxn.txnDetailId);
                    }
                }

                if (paymentsAdded === 0) {
                    log.audit({
                        title: MODULE_NAME + '.createBankDeposit',
                        details: 'No payments found in undeposited funds to add to deposit'
                    });
                    return null;
                }

                const addedTxnDetailIds = depositRecord._addedTxnDetailIds || [];
                const depositId = depositRecord.save();

                // Update transaction detail records with deposit ID
                for (const txnDetailId of addedTxnDetailIds) {
                    record.submitFields({
                        type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                        id: txnDetailId,
                        values: {
                            [constants.TXN_DETAIL_FIELDS.IN_DEPOSIT]: true,
                            [constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT]: depositId
                        }
                    });
                }

                log.audit({
                    title: MODULE_NAME + '.createBankDeposit',
                    details: 'Created Bank Deposit ' + depositId + ' with ' + paymentsAdded + ' payments'
                });

                return depositId;

            } catch (e) {
                log.error({
                    title: MODULE_NAME + '.createBankDeposit',
                    details: 'Error creating bank deposit: ' + e.message
                });
                throw e;
            }
        }

        /**
         * Updates the settlement record with processing results
         * @param {Object} options - Update options
         * @param {number} options.settlementInternalId - Settlement record internal ID
         * @param {number} options.matchedCount - Number of matched transactions
         * @param {number} options.unmatchedCount - Number of unmatched transactions
         * @param {number} options.matchedAmount - Total matched amount
         * @param {number|null} options.bankDepositId - Bank Deposit internal ID
         * @param {string|null} options.errorMessage - Error message if any
         */
        function updateSettlementRecord(options) {
            const {
                settlementInternalId,
                matchedCount,
                unmatchedCount,
                matchedAmount,
                bankDepositId,
                errorMessage
            } = options;

            const updateValues = {
                [constants.SETTLEMENT_FIELDS.MATCHED_COUNT]: matchedCount,
                [constants.SETTLEMENT_FIELDS.UNMATCHED_COUNT]: unmatchedCount,
                [constants.SETTLEMENT_FIELDS.MATCHED_AMOUNT]: matchedAmount,
                [constants.SETTLEMENT_FIELDS.PROCESSED]: true,
                [constants.SETTLEMENT_FIELDS.PROCESSED_DATE]: new Date()
            };

            if (bankDepositId) {
                updateValues[constants.SETTLEMENT_FIELDS.BANK_DEPOSIT] = bankDepositId;
            }

            if (errorMessage) {
                updateValues[constants.SETTLEMENT_FIELDS.ERROR_MESSAGE] = errorMessage;
            }

            record.submitFields({
                type: constants.RECORD_TYPES.SETTLEMENT,
                id: settlementInternalId,
                values: updateValues
            });

            log.audit({
                title: MODULE_NAME + '.updateSettlementRecord',
                details: 'Updated settlement ' + settlementInternalId +
                         ' (matched: ' + matchedCount + ', unmatched: ' + unmatchedCount + ')'
            });
        }

        /**
         * Gets unmatched transaction details for a settlement
         * @param {number} settlementInternalId - Settlement record internal ID
         * @returns {Array} Array of unmatched transaction details
         */
        function getUnmatchedTransactions(settlementInternalId) {
            const unmatchedSearch = search.create({
                type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                filters: [
                    [constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT, 'is', settlementInternalId],
                    'AND',
                    [constants.TXN_DETAIL_FIELDS.MATCHED, 'is', 'F']
                ],
                columns: [
                    constants.TXN_DETAIL_FIELDS.TRANSACTION_ID,
                    constants.TXN_DETAIL_FIELDS.MERCHANT_REFERENCE,
                    constants.TXN_DETAIL_FIELDS.AMOUNT,
                    constants.TXN_DETAIL_FIELDS.TYPE,
                    constants.TXN_DETAIL_FIELDS.MATCH_ERROR
                ]
            });

            const results = [];
            unmatchedSearch.run().each(function(result) {
                results.push({
                    transactionId: result.getValue(constants.TXN_DETAIL_FIELDS.TRANSACTION_ID),
                    merchantReference: result.getValue(constants.TXN_DETAIL_FIELDS.MERCHANT_REFERENCE),
                    amount: result.getValue(constants.TXN_DETAIL_FIELDS.AMOUNT),
                    type: result.getValue(constants.TXN_DETAIL_FIELDS.TYPE),
                    error: result.getValue(constants.TXN_DETAIL_FIELDS.MATCH_ERROR)
                });
                return true;
            });

            return results;
        }

        /**
         * Gets recent settlements for the dashboard
         * @param {number} limit - Maximum number of records to return
         * @returns {Array} Array of recent settlement records
         */
        function getRecentSettlements(limit) {
            return getSettlementsByDateRange(null, null, limit);
        }

        /**
         * Gets settlements filtered by date range
         * @param {Date|string|null} startDate - Start date filter (inclusive)
         * @param {Date|string|null} endDate - End date filter (inclusive)
         * @param {number} limit - Maximum number of records to return
         * @returns {Array} Array of settlement records
         */
        function getSettlementsByDateRange(startDate, endDate, limit) {
            const filters = [];

            // Add date filters if provided
            if (startDate) {
                filters.push([constants.SETTLEMENT_FIELDS.SETTLEMENT_DATE, 'onorafter', startDate]);
            }
            if (endDate) {
                if (filters.length > 0) filters.push('AND');
                filters.push([constants.SETTLEMENT_FIELDS.SETTLEMENT_DATE, 'onorbefore', endDate]);
            }

            const settlementSearch = search.create({
                type: constants.RECORD_TYPES.SETTLEMENT,
                filters: filters,
                columns: [
                    search.createColumn({
                        name: constants.SETTLEMENT_FIELDS.SETTLEMENT_DATE,
                        sort: search.Sort.DESC
                    }),
                    constants.SETTLEMENT_FIELDS.SETTLEMENT_ID,
                    constants.SETTLEMENT_FIELDS.AMOUNT,
                    constants.SETTLEMENT_FIELDS.CURRENCY,
                    constants.SETTLEMENT_FIELDS.STATUS,
                    constants.SETTLEMENT_FIELDS.CRDR,
                    constants.SETTLEMENT_FIELDS.REFERENCE_NUMBER,
                    constants.SETTLEMENT_FIELDS.PROCESSED,
                    constants.SETTLEMENT_FIELDS.MATCHED_COUNT,
                    constants.SETTLEMENT_FIELDS.UNMATCHED_COUNT,
                    constants.SETTLEMENT_FIELDS.MATCHED_AMOUNT,
                    constants.SETTLEMENT_FIELDS.BANK_DEPOSIT,
                    constants.SETTLEMENT_FIELDS.ERROR_MESSAGE
                ]
            });

            const results = [];
            settlementSearch.run().getRange({ start: 0, end: limit || 100 }).forEach(function(result) {
                results.push({
                    internalId: result.id,
                    settlementDate: result.getValue(constants.SETTLEMENT_FIELDS.SETTLEMENT_DATE),
                    settlementId: result.getValue(constants.SETTLEMENT_FIELDS.SETTLEMENT_ID),
                    amount: result.getValue(constants.SETTLEMENT_FIELDS.AMOUNT),
                    currency: result.getValue(constants.SETTLEMENT_FIELDS.CURRENCY),
                    status: result.getValue(constants.SETTLEMENT_FIELDS.STATUS),
                    crdr: result.getValue(constants.SETTLEMENT_FIELDS.CRDR),
                    referenceNumber: result.getValue(constants.SETTLEMENT_FIELDS.REFERENCE_NUMBER),
                    processed: result.getValue(constants.SETTLEMENT_FIELDS.PROCESSED),
                    matchedCount: result.getValue(constants.SETTLEMENT_FIELDS.MATCHED_COUNT),
                    unmatchedCount: result.getValue(constants.SETTLEMENT_FIELDS.UNMATCHED_COUNT),
                    matchedAmount: result.getValue(constants.SETTLEMENT_FIELDS.MATCHED_AMOUNT),
                    bankDepositId: result.getValue(constants.SETTLEMENT_FIELDS.BANK_DEPOSIT),
                    bankDepositText: result.getText(constants.SETTLEMENT_FIELDS.BANK_DEPOSIT),
                    errorMessage: result.getValue(constants.SETTLEMENT_FIELDS.ERROR_MESSAGE)
                });
            });

            return results;
        }

        /**
         * Gets all transaction details for a settlement
         * @param {number} settlementInternalId - Settlement record internal ID
         * @returns {Array} Array of all transaction details
         */
        function getAllTransactionsForSettlement(settlementInternalId) {
            const txnSearch = search.create({
                type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                filters: [
                    [constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT, 'is', settlementInternalId]
                ],
                columns: [
                    constants.TXN_DETAIL_FIELDS.TRANSACTION_ID,
                    constants.TXN_DETAIL_FIELDS.MERCHANT_REFERENCE,
                    constants.TXN_DETAIL_FIELDS.AMOUNT,
                    constants.TXN_DETAIL_FIELDS.CURRENCY,
                    constants.TXN_DETAIL_FIELDS.TYPE,
                    constants.TXN_DETAIL_FIELDS.METHOD,
                    constants.TXN_DETAIL_FIELDS.AUTH_CODE,
                    constants.TXN_DETAIL_FIELDS.DATETIME_UTC,
                    constants.TXN_DETAIL_FIELDS.NS_TRANSACTION,
                    constants.TXN_DETAIL_FIELDS.MATCHED,
                    constants.TXN_DETAIL_FIELDS.MATCH_ERROR,
                    constants.TXN_DETAIL_FIELDS.IN_DEPOSIT,
                    constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT
                ]
            });

            const results = [];
            txnSearch.run().each(function(result) {
                results.push({
                    internalId: result.id,
                    transactionId: result.getValue(constants.TXN_DETAIL_FIELDS.TRANSACTION_ID),
                    merchantReference: result.getValue(constants.TXN_DETAIL_FIELDS.MERCHANT_REFERENCE),
                    amount: result.getValue(constants.TXN_DETAIL_FIELDS.AMOUNT),
                    currency: result.getValue(constants.TXN_DETAIL_FIELDS.CURRENCY),
                    type: result.getValue(constants.TXN_DETAIL_FIELDS.TYPE),
                    method: result.getValue(constants.TXN_DETAIL_FIELDS.METHOD),
                    authCode: result.getValue(constants.TXN_DETAIL_FIELDS.AUTH_CODE),
                    dateTimeUtc: result.getValue(constants.TXN_DETAIL_FIELDS.DATETIME_UTC),
                    nsTransactionId: result.getValue(constants.TXN_DETAIL_FIELDS.NS_TRANSACTION),
                    nsTransactionText: result.getText(constants.TXN_DETAIL_FIELDS.NS_TRANSACTION),
                    matched: result.getValue(constants.TXN_DETAIL_FIELDS.MATCHED),
                    matchError: result.getValue(constants.TXN_DETAIL_FIELDS.MATCH_ERROR),
                    inDeposit: result.getValue(constants.TXN_DETAIL_FIELDS.IN_DEPOSIT),
                    bankDepositId: result.getValue(constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT),
                    bankDepositText: result.getText(constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT)
                });
                return true;
            });

            return results;
        }

        /**
         * Gets a single settlement record by internal ID
         * @param {number} settlementInternalId - Settlement record internal ID
         * @returns {Object|null} Settlement record data or null if not found
         */
        function getSettlementById(settlementInternalId) {
            try {
                const settlementRecord = record.load({
                    type: constants.RECORD_TYPES.SETTLEMENT,
                    id: settlementInternalId
                });

                return {
                    internalId: settlementInternalId,
                    settlementId: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.SETTLEMENT_ID),
                    settlementDate: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.SETTLEMENT_DATE),
                    amount: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.AMOUNT),
                    currency: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.CURRENCY),
                    status: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.STATUS),
                    crdr: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.CRDR),
                    referenceNumber: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.REFERENCE_NUMBER),
                    merchantId: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.MERCHANT_ID),
                    processed: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.PROCESSED),
                    matchedCount: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.MATCHED_COUNT),
                    unmatchedCount: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.UNMATCHED_COUNT),
                    matchedAmount: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.MATCHED_AMOUNT),
                    bankDepositId: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.BANK_DEPOSIT),
                    errorMessage: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.ERROR_MESSAGE),
                    processedDate: settlementRecord.getValue(constants.SETTLEMENT_FIELDS.PROCESSED_DATE)
                };
            } catch (e) {
                log.error({
                    title: MODULE_NAME + '.getSettlementById',
                    details: 'Error loading settlement ' + settlementInternalId + ': ' + e.message
                });
                return null;
            }
        }

        /**
         * Manually matches a Windcave transaction detail to a NetSuite transaction
         * @param {number} txnDetailId - Transaction detail record internal ID
         * @param {number} nsTransactionId - NetSuite transaction internal ID
         * @returns {Object} Result with success status and any error message
         */
        function manualMatchTransaction(txnDetailId, nsTransactionId) {
            try {
                // Load the transaction detail to get the Windcave amount
                const txnDetail = record.load({
                    type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                    id: txnDetailId
                });

                const windcaveAmount = parseFloat(txnDetail.getValue(constants.TXN_DETAIL_FIELDS.AMOUNT));
                const settlementId = txnDetail.getValue(constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT);

                // Find and validate the NS transaction
                const nsTransaction = findNetSuiteTransaction(nsTransactionId);
                if (!nsTransaction) {
                    return {
                        success: false,
                        error: 'NetSuite transaction not found: ' + nsTransactionId
                    };
                }

                // Validate it can be deposited
                const validation = validatePaymentForDeposit(nsTransaction, { amount: windcaveAmount });
                if (!validation.isValid) {
                    return {
                        success: false,
                        error: validation.error
                    };
                }

                // Update the transaction detail record
                record.submitFields({
                    type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                    id: txnDetailId,
                    values: {
                        [constants.TXN_DETAIL_FIELDS.NS_TRANSACTION]: nsTransactionId,
                        [constants.TXN_DETAIL_FIELDS.MATCHED]: true,
                        [constants.TXN_DETAIL_FIELDS.MATCH_ERROR]: ''
                    }
                });

                // Update settlement matched/unmatched counts
                updateSettlementMatchCounts(settlementId);

                log.audit({
                    title: MODULE_NAME + '.manualMatchTransaction',
                    details: 'Manually matched txn detail ' + txnDetailId + ' to NS txn ' + nsTransactionId
                });

                return { success: true };

            } catch (e) {
                log.error({
                    title: MODULE_NAME + '.manualMatchTransaction',
                    details: 'Error: ' + e.message
                });
                return {
                    success: false,
                    error: e.message
                };
            }
        }

        /**
         * Updates the matched/unmatched counts on a settlement record
         * @param {number} settlementInternalId - Settlement record internal ID
         */
        function updateSettlementMatchCounts(settlementInternalId) {
            // Count matched and unmatched transactions
            const txnSearch = search.create({
                type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                filters: [
                    [constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT, 'is', settlementInternalId]
                ],
                columns: [
                    constants.TXN_DETAIL_FIELDS.MATCHED,
                    constants.TXN_DETAIL_FIELDS.AMOUNT
                ]
            });

            let matchedCount = 0;
            let unmatchedCount = 0;
            let matchedAmount = 0;

            txnSearch.run().each(function(result) {
                const isMatched = result.getValue(constants.TXN_DETAIL_FIELDS.MATCHED) === true ||
                                  result.getValue(constants.TXN_DETAIL_FIELDS.MATCHED) === 'T';
                const amount = parseFloat(result.getValue(constants.TXN_DETAIL_FIELDS.AMOUNT)) || 0;

                if (isMatched) {
                    matchedCount++;
                    matchedAmount += amount;
                } else {
                    unmatchedCount++;
                }
                return true;
            });

            // Update settlement record
            const updateValues = {
                [constants.SETTLEMENT_FIELDS.MATCHED_COUNT]: matchedCount,
                [constants.SETTLEMENT_FIELDS.UNMATCHED_COUNT]: unmatchedCount,
                [constants.SETTLEMENT_FIELDS.MATCHED_AMOUNT]: matchedAmount
            };

            // Update error message based on unmatched count
            if (unmatchedCount > 0) {
                updateValues[constants.SETTLEMENT_FIELDS.ERROR_MESSAGE] = 'Unmatched: ' + unmatchedCount + ' transactions';
            } else {
                updateValues[constants.SETTLEMENT_FIELDS.ERROR_MESSAGE] = '';
            }

            record.submitFields({
                type: constants.RECORD_TYPES.SETTLEMENT,
                id: settlementInternalId,
                values: updateValues
            });
        }

        /**
         * Gets all deposits associated with a settlement (via transaction details)
         * @param {number} settlementInternalId - Settlement record internal ID
         * @returns {Array} Array of unique deposit records
         */
        function getDepositsForSettlement(settlementInternalId) {
            const depositSearch = search.create({
                type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                filters: [
                    [constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT, 'is', settlementInternalId],
                    'AND',
                    [constants.TXN_DETAIL_FIELDS.IN_DEPOSIT, 'is', 'T'],
                    'AND',
                    [constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT, 'isnotempty', '']
                ],
                columns: [
                    search.createColumn({
                        name: constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT,
                        summary: search.Summary.GROUP
                    }),
                    search.createColumn({
                        name: constants.TXN_DETAIL_FIELDS.AMOUNT,
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            const deposits = [];
            depositSearch.run().each(function(result) {
                const depositId = result.getValue({
                    name: constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT,
                    summary: search.Summary.GROUP
                });
                const depositText = result.getText({
                    name: constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT,
                    summary: search.Summary.GROUP
                });
                const totalAmount = parseFloat(result.getValue({
                    name: constants.TXN_DETAIL_FIELDS.AMOUNT,
                    summary: search.Summary.SUM
                })) || 0;
                const txnCount = parseInt(result.getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;

                if (depositId) {
                    deposits.push({
                        depositId: depositId,
                        depositText: depositText || 'Deposit #' + depositId,
                        amount: totalAmount,
                        transactionCount: txnCount
                    });
                }
                return true;
            });

            return deposits;
        }

        /**
         * Gets transactions that are matched but not yet in a deposit
         * @param {number} settlementInternalId - Settlement record internal ID
         * @returns {Array} Array of transaction details ready for deposit
         */
        function getMatchedNotDepositedTransactions(settlementInternalId) {
            const txnSearch = search.create({
                type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                filters: [
                    [constants.TXN_DETAIL_FIELDS.PARENT_SETTLEMENT, 'is', settlementInternalId],
                    'AND',
                    [constants.TXN_DETAIL_FIELDS.MATCHED, 'is', 'T'],
                    'AND',
                    [constants.TXN_DETAIL_FIELDS.IN_DEPOSIT, 'is', 'F']
                ],
                columns: [
                    constants.TXN_DETAIL_FIELDS.TRANSACTION_ID,
                    constants.TXN_DETAIL_FIELDS.AMOUNT,
                    constants.TXN_DETAIL_FIELDS.NS_TRANSACTION
                ]
            });

            const transactions = [];
            txnSearch.run().each(function(result) {
                transactions.push({
                    txnDetailId: result.id,
                    transactionId: result.getValue(constants.TXN_DETAIL_FIELDS.TRANSACTION_ID),
                    amount: parseFloat(result.getValue(constants.TXN_DETAIL_FIELDS.AMOUNT)) || 0,
                    nsTransactionId: result.getValue(constants.TXN_DETAIL_FIELDS.NS_TRANSACTION),
                    nsTransactionText: result.getText(constants.TXN_DETAIL_FIELDS.NS_TRANSACTION)
                });
                return true;
            });

            return transactions;
        }

        /**
         * Creates a supplementary bank deposit for matched transactions not yet deposited
         * @param {number} settlementInternalId - Settlement record internal ID
         * @param {number} bankAccountId - Bank account internal ID
         * @returns {Object} Result with depositId or error
         */
        function createSupplementaryDeposit(settlementInternalId, bankAccountId) {
            try {
                // Get settlement info for memo
                const settlement = getSettlementById(settlementInternalId);
                if (!settlement) {
                    return { success: false, error: 'Settlement not found' };
                }

                // Get matched but not deposited transactions
                const pendingTransactions = getMatchedNotDepositedTransactions(settlementInternalId);
                if (pendingTransactions.length === 0) {
                    return { success: false, error: 'No matched transactions pending deposit' };
                }

                // Create the deposit
                const depositRecord = record.create({
                    type: record.Type.DEPOSIT,
                    isDynamic: true
                });

                depositRecord.setValue({
                    fieldId: 'account',
                    value: bankAccountId
                });

                // Use settlement date
                depositRecord.setValue({
                    fieldId: 'trandate',
                    value: settlement.settlementDate
                });

                depositRecord.setValue({
                    fieldId: 'memo',
                    value: 'Windcave Settlement ' + (settlement.referenceNumber || settlement.settlementId) +
                           ' - Supplementary Deposit'
                });

                // Find and select matching payments
                let paymentsAdded = 0;
                const addedTxnDetailIds = [];
                const lineCount = depositRecord.getLineCount({ sublistId: 'payment' });

                for (let i = 0; i < lineCount; i++) {
                    const paymentId = depositRecord.getSublistValue({
                        sublistId: 'payment',
                        fieldId: 'id',
                        line: i
                    });

                    // Check if this payment is in our pending list
                    const pendingTxn = pendingTransactions.find(t => t.nsTransactionId == paymentId);

                    if (pendingTxn) {
                        depositRecord.selectLine({
                            sublistId: 'payment',
                            line: i
                        });
                        depositRecord.setCurrentSublistValue({
                            sublistId: 'payment',
                            fieldId: 'deposit',
                            value: true
                        });
                        depositRecord.commitLine({
                            sublistId: 'payment'
                        });
                        paymentsAdded++;
                        addedTxnDetailIds.push(pendingTxn.txnDetailId);
                    }
                }

                if (paymentsAdded === 0) {
                    return {
                        success: false,
                        error: 'No payments found in undeposited funds. Payments may have already been deposited elsewhere.'
                    };
                }

                const depositId = depositRecord.save();

                // Update transaction detail records
                for (const txnDetailId of addedTxnDetailIds) {
                    record.submitFields({
                        type: constants.RECORD_TYPES.TRANSACTION_DETAIL,
                        id: txnDetailId,
                        values: {
                            [constants.TXN_DETAIL_FIELDS.IN_DEPOSIT]: true,
                            [constants.TXN_DETAIL_FIELDS.BANK_DEPOSIT]: depositId
                        }
                    });
                }

                log.audit({
                    title: MODULE_NAME + '.createSupplementaryDeposit',
                    details: 'Created supplementary deposit ' + depositId + ' with ' + paymentsAdded + ' payments for settlement ' + settlementInternalId
                });

                return {
                    success: true,
                    depositId: depositId,
                    paymentsAdded: paymentsAdded
                };

            } catch (e) {
                log.error({
                    title: MODULE_NAME + '.createSupplementaryDeposit',
                    details: 'Error: ' + e.message
                });
                return {
                    success: false,
                    error: e.message
                };
            }
        }

        /**
         * Searches for NetSuite transactions by various criteria for manual matching
         * @param {Object} options - Search options
         * @param {string} options.searchText - Text to search for (tranid, amount, etc.)
         * @param {number} options.amount - Amount to filter by (optional)
         * @returns {Array} Array of matching transactions
         */
        function searchNetSuiteTransactions(options) {
            const filters = [
                ['mainline', 'is', 'T'],
                'AND',
                [
                    ['type', 'anyof', 'CustPymt'],
                    'OR',
                    ['type', 'anyof', 'CashSale']
                ],
                'AND',
                ['undepfunds', 'is', 'T'] // Only undeposited funds
            ];

            // Add text search if provided
            if (options.searchText) {
                filters.push('AND');
                filters.push([
                    ['tranid', 'contains', options.searchText],
                    'OR',
                    ['internalid', 'is', options.searchText],
                    'OR',
                    ['entity', 'anyof', options.searchText]
                ]);
            }

            // Add amount filter if provided (with tolerance)
            if (options.amount) {
                const tolerance = constants.MISC.AMOUNT_TOLERANCE;
                filters.push('AND');
                filters.push(['amount', 'between', options.amount - tolerance, options.amount + tolerance]);
            }

            const txnSearch = search.create({
                type: search.Type.TRANSACTION,
                filters: filters,
                columns: [
                    'internalid',
                    'type',
                    'tranid',
                    'trandate',
                    'entity',
                    'amount',
                    'currency',
                    'status'
                ]
            });

            const results = [];
            txnSearch.run().getRange({ start: 0, end: 50 }).forEach(function(result) {
                results.push({
                    internalId: result.getValue('internalid'),
                    type: result.getText('type'),
                    tranId: result.getValue('tranid'),
                    tranDate: result.getValue('trandate'),
                    entity: result.getText('entity'),
                    amount: parseFloat(result.getValue('amount')),
                    currency: result.getText('currency'),
                    status: result.getText('status')
                });
            });

            return results;
        }

        return {
            loadConfiguration,
            loadAllConfigurations,
            loadConfigurationById,
            isSettlementProcessed,
            createSettlementRecord,
            createTransactionDetailRecord,
            findNetSuiteTransaction,
            validatePaymentForDeposit,
            matchTransactions,
            createBankDeposit,
            updateSettlementRecord,
            getUnmatchedTransactions,
            getRecentSettlements,
            getSettlementsByDateRange,
            getAllTransactionsForSettlement,
            getSettlementById,
            manualMatchTransaction,
            updateSettlementMatchCounts,
            getDepositsForSettlement,
            getMatchedNotDepositedTransactions,
            createSupplementaryDeposit,
            searchNetSuiteTransactions
        };
    });
