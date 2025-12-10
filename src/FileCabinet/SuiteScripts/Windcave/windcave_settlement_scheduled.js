/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Windcave Settlement Integration - Scheduled Script
 * Runs daily to fetch settlements from Windcave API and create Bank Deposits.
 */
define([
    'N/log',
    'N/email',
    'N/runtime',
    'N/format',
    'N/record',
    './windcave_constants',
    './windcave_api_module',
    './windcave_reconciliation_lib'
], function(log, email, runtime, format, record, constants, windcaveApi, reconciliation) {

    const SCRIPT_NAME = 'WindcaveSettlementScheduled';

    /**
     * Checks if a configuration should run based on schedule settings
     * @param {Object} config - Configuration object
     * @returns {boolean} True if should run now
     */
    function shouldRunNow(config) {
        // If scheduling not enabled, don't run
        if (!config.enableScheduled) {
            log.debug({
                title: SCRIPT_NAME + '.shouldRunNow',
                details: '[' + config.name + '] Scheduled fetch not enabled'
            });
            return false;
        }

        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay() + 1; // JS: 0=Sun, NS: 1=Sun

        // Check hour (allow within same hour)
        const scheduleHour = config.scheduleHour || 6;
        if (currentHour !== scheduleHour) {
            log.debug({
                title: SCRIPT_NAME + '.shouldRunNow',
                details: '[' + config.name + '] Not scheduled hour. Current: ' + currentHour + ', Scheduled: ' + scheduleHour
            });
            return false;
        }

        // Check frequency
        const frequency = config.scheduleFreq || constants.SCHEDULE_FREQUENCY.DAILY;

        if (frequency === constants.SCHEDULE_FREQUENCY.WEEKLY) {
            const scheduleDay = parseInt(config.scheduleDay) || 2; // Default Monday
            if (currentDay !== scheduleDay) {
                log.debug({
                    title: SCRIPT_NAME + '.shouldRunNow',
                    details: '[' + config.name + '] Not scheduled day. Current: ' + currentDay + ', Scheduled: ' + scheduleDay
                });
                return false;
            }
        }

        // Check if already run today/this hour (prevent duplicate runs)
        if (config.lastRunDate) {
            const lastRun = new Date(config.lastRunDate);
            const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
            if (hoursSinceLastRun < 1) {
                log.debug({
                    title: SCRIPT_NAME + '.shouldRunNow',
                    details: '[' + config.name + '] Already ran within the last hour'
                });
                return false;
            }
        }

        log.audit({
            title: SCRIPT_NAME + '.shouldRunNow',
            details: '[' + config.name + '] Schedule check passed, will process'
        });
        return true;
    }

    /**
     * Updates the last run date and status on a configuration record
     * @param {number} configId - Configuration internal ID
     * @param {string} status - Status message
     */
    function updateConfigRunStatus(configId, status) {
        try {
            record.submitFields({
                type: constants.RECORD_TYPES.CONFIG,
                id: configId,
                values: {
                    [constants.CONFIG_FIELDS.LAST_RUN_DATE]: new Date(),
                    [constants.CONFIG_FIELDS.LAST_RUN_STATUS]: status
                }
            });
        } catch (e) {
            log.error({
                title: SCRIPT_NAME + '.updateConfigRunStatus',
                details: 'Failed to update config ' + configId + ': ' + e.message
            });
        }
    }

    /**
     * Main entry point for scheduled script execution
     * @param {Object} context - Script context
     */
    function execute(context) {
        log.audit({
            title: SCRIPT_NAME,
            details: 'Starting Windcave settlement processing'
        });

        const processingResults = {
            startTime: new Date(),
            configurationsProcessed: 0,
            settlementsFound: 0,
            settlementsProcessed: 0,
            settlementsSkipped: 0,
            totalMatched: 0,
            totalUnmatched: 0,
            totalAmount: 0,
            depositsCreated: 0,
            errors: [],
            configResults: [] // Track results per configuration
        };

        // Collect all notification emails for combined summary
        const notificationEmails = new Set();

        try {
            // Load ALL active configurations
            const configurations = reconciliation.loadAllConfigurations();

            log.audit({
                title: SCRIPT_NAME,
                details: 'Found ' + configurations.length + ' active configuration(s)'
            });

            // Process each configuration
            for (const config of configurations) {
                // Check if this config should run based on schedule
                if (!shouldRunNow(config)) {
                    log.debug({
                        title: SCRIPT_NAME,
                        details: 'Skipping configuration ' + config.name + ' - not scheduled to run now'
                    });
                    continue;
                }

                // Check governance before processing each config
                const remainingUsage = runtime.getCurrentScript().getRemainingUsage();
                if (remainingUsage < 1000) {
                    log.audit({
                        title: SCRIPT_NAME,
                        details: 'Low governance remaining (' + remainingUsage + '), stopping processing'
                    });
                    processingResults.errors.push('Processing stopped due to low governance');
                    break;
                }

                // Track results for this configuration
                const configResult = {
                    configId: config.internalId,
                    configName: config.name,
                    merchantId: config.merchantId,
                    settlementsFound: 0,
                    settlementsProcessed: 0,
                    matched: 0,
                    unmatched: 0,
                    errors: [],
                    sendEmail: config.sendEmail
                };

                try {
                    log.audit({
                        title: SCRIPT_NAME,
                        details: 'Processing configuration: ' + config.name +
                                 ' (Merchant ID: ' + config.merchantId + ')'
                    });

                    // Collect notification email only if send email is enabled
                    if (config.sendEmail && config.notificationEmail) {
                        notificationEmails.add(config.notificationEmail);
                    }

                    // Calculate date range for this config
                    const dateRange = windcaveApi.calculateDateRange(config.lookbackDays);

                    log.audit({
                        title: SCRIPT_NAME,
                        details: '[' + config.name + '] Fetching settlements from ' +
                                 dateRange.startDate + ' to ' + dateRange.endDate
                    });

                    // Fetch settlements from Windcave
                    const settlementsResponse = windcaveApi.getSettlements({
                        username: config.apiUsername,
                        password: config.apiPassword,
                        environment: config.environment,
                        merchantId: config.merchantId,
                        customerId: config.customerId,
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate
                    });

                    const settlements = settlementsResponse.settlements || [];
                    configResult.settlementsFound = settlements.length;
                    processingResults.settlementsFound += settlements.length;

                    log.audit({
                        title: SCRIPT_NAME,
                        details: '[' + config.name + '] Found ' + settlements.length + ' settlements'
                    });

                    // Process each settlement for this configuration
                    for (const settlement of settlements) {
                        // Check governance
                        const remainingUsage = runtime.getCurrentScript().getRemainingUsage();
                        if (remainingUsage < 500) {
                            log.audit({
                                title: SCRIPT_NAME,
                                details: 'Low governance remaining (' + remainingUsage + '), stopping processing'
                            });
                            processingResults.errors.push('Processing stopped due to low governance');
                            break;
                        }

                        try {
                            const result = processSettlement(settlement, config, processingResults);
                            if (result) {
                                configResult.settlementsProcessed++;
                                configResult.matched += result.matched || 0;
                                configResult.unmatched += result.unmatched || 0;
                            }
                        } catch (settlementError) {
                            log.error({
                                title: SCRIPT_NAME + '.processSettlement',
                                details: '[' + config.name + '] Error processing settlement ' +
                                         settlement.id + ': ' + settlementError.message
                            });
                            const errorMsg = '[' + config.name + '] Settlement ' + settlement.id + ': ' + settlementError.message;
                            processingResults.errors.push(errorMsg);
                            configResult.errors.push(errorMsg);
                        }
                    }

                    processingResults.configurationsProcessed++;

                    // Update config with successful run status
                    const statusMsg = 'Success: ' + configResult.settlementsProcessed + ' settlements processed, ' +
                                      configResult.matched + ' matched, ' + configResult.unmatched + ' unmatched';
                    updateConfigRunStatus(config.internalId, statusMsg);

                } catch (configError) {
                    log.error({
                        title: SCRIPT_NAME,
                        details: 'Error processing configuration ' + config.name + ': ' + configError.message
                    });
                    processingResults.errors.push(
                        'Configuration ' + config.name + ': ' + configError.message
                    );
                    configResult.errors.push(configError.message);

                    // Update config with error status
                    updateConfigRunStatus(config.internalId, 'Error: ' + configError.message);
                }

                processingResults.configResults.push(configResult);
            }

            processingResults.endTime = new Date();

            // Send notification email to all collected addresses
            for (const emailAddr of notificationEmails) {
                sendNotificationEmail(emailAddr, processingResults);
            }

            log.audit({
                title: SCRIPT_NAME,
                details: 'Processing complete. Configs: ' + processingResults.configurationsProcessed +
                         ', Processed: ' + processingResults.settlementsProcessed +
                         ', Skipped: ' + processingResults.settlementsSkipped +
                         ', Errors: ' + processingResults.errors.length
            });

        } catch (e) {
            log.error({
                title: SCRIPT_NAME,
                details: 'Fatal error: ' + e.message + '\n' + e.stack
            });
            processingResults.errors.push('Fatal error: ' + e.message);

            // Try to send error notification
            try {
                const config = reconciliation.loadConfiguration();
                if (config.notificationEmail) {
                    sendNotificationEmail(config.notificationEmail, processingResults);
                }
            } catch (emailError) {
                log.error({
                    title: SCRIPT_NAME,
                    details: 'Failed to send error notification: ' + emailError.message
                });
            }
        }
    }

    /**
     * Processes a single settlement
     * @param {Object} settlement - Settlement data from API
     * @param {Object} config - Configuration values
     * @param {Object} results - Processing results object to update
     * @returns {Object|null} Result object with matched/unmatched counts, or null if skipped
     */
    function processSettlement(settlement, config, results) {
        log.debug({
            title: SCRIPT_NAME + '.processSettlement',
            details: '[' + config.name + '] Processing settlement: ' + settlement.id +
                     ' (Status: ' + settlement.status +
                     ', Amount: ' + settlement.amount + ' ' + settlement.currency + ')'
        });

        // Skip if not Done status
        if (settlement.status !== constants.SETTLEMENT_STATUS.DONE) {
            log.audit({
                title: SCRIPT_NAME + '.processSettlement',
                details: '[' + config.name + '] Skipping settlement ' + settlement.id + ' with status: ' + settlement.status
            });
            results.settlementsSkipped++;
            return null;
        }

        // Skip if already processed
        if (reconciliation.isSettlementProcessed(settlement.id)) {
            log.audit({
                title: SCRIPT_NAME + '.processSettlement',
                details: '[' + config.name + '] Settlement ' + settlement.id + ' already processed, skipping'
            });
            results.settlementsSkipped++;
            return null;
        }

        // Fetch settlement details with transactions
        const settlementDetails = windcaveApi.getSettlementDetails({
            username: config.apiUsername,
            password: config.apiPassword,
            environment: config.environment,
            settlementId: settlement.id
        });

        const transactions = settlementDetails.transactions || [];

        log.audit({
            title: SCRIPT_NAME + '.processSettlement',
            details: '[' + config.name + '] Settlement ' + settlement.id + ' has ' + transactions.length + ' transactions'
        });

        // Create settlement record
        const settlementInternalId = reconciliation.createSettlementRecord(settlementDetails);

        // Match transactions to NetSuite payments
        const matchResults = reconciliation.matchTransactions(transactions, settlementInternalId);

        // Calculate matched amount
        let matchedAmount = 0;
        for (const match of matchResults.matched) {
            matchedAmount += parseFloat(match.windcaveTxn.amount);
        }

        // Create bank deposit for credit settlements
        let bankDepositId = null;
        if (settlement.CRDR === constants.CRDR.CREDIT && matchResults.matched.length > 0) {
            bankDepositId = reconciliation.createBankDeposit({
                settlementData: settlementDetails,
                matchedTransactions: matchResults.matched,
                bankAccountId: config.bankAccount
            });

            if (bankDepositId) {
                results.depositsCreated++;
            }
        } else if (settlement.CRDR === constants.CRDR.DEBIT) {
            log.audit({
                title: SCRIPT_NAME + '.processSettlement',
                details: '[' + config.name + '] Debit settlement ' + settlement.id + ' requires manual handling'
            });
        }

        // Build error message if there are unmatched transactions
        let errorMessage = null;
        if (matchResults.unmatched.length > 0) {
            const errorDetails = matchResults.unmatched.map(u =>
                'Txn ' + u.windcaveTxn.id + ': ' + u.error
            );
            errorMessage = 'Unmatched transactions:\n' + errorDetails.join('\n');
        }

        // Update settlement record with results
        reconciliation.updateSettlementRecord({
            settlementInternalId: settlementInternalId,
            matchedCount: matchResults.matched.length,
            unmatchedCount: matchResults.unmatched.length,
            matchedAmount: matchedAmount,
            bankDepositId: bankDepositId,
            errorMessage: errorMessage
        });

        // Update processing results
        results.settlementsProcessed++;
        results.totalMatched += matchResults.matched.length;
        results.totalUnmatched += matchResults.unmatched.length;
        results.totalAmount += parseFloat(settlement.amount);

        log.audit({
            title: SCRIPT_NAME + '.processSettlement',
            details: '[' + config.name + '] Completed processing settlement ' + settlement.id +
                     ' (Matched: ' + matchResults.matched.length +
                     ', Unmatched: ' + matchResults.unmatched.length +
                     ', Deposit: ' + (bankDepositId || 'N/A') + ')'
        });

        return {
            matched: matchResults.matched.length,
            unmatched: matchResults.unmatched.length
        };
    }

    /**
     * Sends a notification email with processing results
     * @param {string} recipientEmail - Email recipient
     * @param {Object} results - Processing results
     */
    function sendNotificationEmail(recipientEmail, results) {
        const hasErrors = results.errors.length > 0 || results.totalUnmatched > 0;
        const subject = hasErrors ?
            constants.EMAIL.SUBJECT_ERROR :
            constants.EMAIL.SUBJECT_SUCCESS;

        const duration = results.endTime ?
            Math.round((results.endTime - results.startTime) / 1000) :
            'N/A';

        let body = 'Windcave Settlement Processing Summary\n';
        body += '======================================\n\n';
        body += 'Processing Date: ' + format.format({
            value: results.startTime,
            type: format.Type.DATETIME
        }) + '\n';
        body += 'Duration: ' + duration + ' seconds\n';
        body += 'Configurations Processed: ' + results.configurationsProcessed + '\n\n';

        body += 'Overall Results:\n';
        body += '----------------\n';
        body += 'Settlements Found: ' + results.settlementsFound + '\n';
        body += 'Settlements Processed: ' + results.settlementsProcessed + '\n';
        body += 'Settlements Skipped: ' + results.settlementsSkipped + '\n';
        body += 'Bank Deposits Created: ' + results.depositsCreated + '\n';
        body += 'Total Amount: ' + results.totalAmount.toFixed(2) + '\n\n';

        body += 'Transaction Matching:\n';
        body += '---------------------\n';
        body += 'Matched: ' + results.totalMatched + '\n';
        body += 'Unmatched: ' + results.totalUnmatched + '\n\n';

        // Per-configuration breakdown
        if (results.configResults && results.configResults.length > 1) {
            body += 'Results by Configuration:\n';
            body += '-------------------------\n';
            for (const configResult of results.configResults) {
                body += '\n[' + configResult.configName + '] (Merchant: ' + configResult.merchantId + ')\n';
                body += '  Settlements: ' + configResult.settlementsFound + ' found, ' + configResult.settlementsProcessed + ' processed\n';
                body += '  Matched: ' + configResult.matched + ', Unmatched: ' + configResult.unmatched + '\n';
                if (configResult.errors.length > 0) {
                    body += '  Errors: ' + configResult.errors.length + '\n';
                }
            }
            body += '\n';
        }

        if (results.errors.length > 0) {
            body += 'Errors:\n';
            body += '-------\n';
            for (const error of results.errors) {
                body += '- ' + error + '\n';
            }
            body += '\n';
        }

        if (results.totalUnmatched > 0) {
            body += 'NOTE: There are unmatched transactions that require manual review.\n';
            body += 'Please check the Windcave Settlement Reconciliation dashboard.\n\n';
        }

        body += 'This is an automated message from NetSuite Windcave Settlement Integration.';

        try {
            email.send({
                author: constants.EMAIL.AUTHOR_ID,
                recipients: recipientEmail,
                subject: subject,
                body: body
            });

            log.audit({
                title: SCRIPT_NAME + '.sendNotificationEmail',
                details: 'Notification email sent to ' + recipientEmail
            });
        } catch (e) {
            log.error({
                title: SCRIPT_NAME + '.sendNotificationEmail',
                details: 'Failed to send email: ' + e.message
            });
        }
    }

    return {
        execute: execute
    };
});
