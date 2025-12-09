/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Windcave Settlement Integration - Dashboard Suitelet
 * Provides a UI for viewing, filtering, and managing Windcave settlements.
 */
define([
    'N/ui/serverWidget',
    'N/log',
    'N/url',
    'N/redirect',
    'N/runtime',
    'N/format',
    './windcave_constants',
    './windcave_api_module',
    './windcave_reconciliation_lib'
], function(serverWidget, log, url, redirect, runtime, format, constants, windcaveApi, reconciliation) {

    const SCRIPT_NAME = 'WindcaveSettlementSuitelet';

    /**
     * Main entry point for Suitelet
     * @param {Object} context - Request/Response context
     */
    function onRequest(context) {
        const request = context.request;
        const response = context.response;

        try {
            if (request.method === 'GET') {
                handleGet(context);
            } else if (request.method === 'POST') {
                handlePost(context);
            }
        } catch (e) {
            log.error({
                title: SCRIPT_NAME,
                details: 'Error: ' + e.message + '\n' + e.stack
            });

            const errorForm = serverWidget.createForm({
                title: 'Windcave Settlement Reconciliation - Error'
            });
            errorForm.addField({
                id: 'custpage_error',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Error'
            }).defaultValue = '<div style="color: red; padding: 20px;">' +
                '<h2>An error occurred</h2>' +
                '<p>' + e.message + '</p></div>';

            response.writePage(errorForm);
        }
    }

    /**
     * Handles GET requests - displays the dashboard
     * @param {Object} context - Request/Response context
     */
    function handleGet(context) {
        const request = context.request;
        const response = context.response;
        const action = request.parameters.action;

        if (action === 'viewdetails') {
            displaySettlementDetails(context);
            return;
        }

        // Create main form
        const form = serverWidget.createForm({
            title: 'Windcave Settlement Reconciliation'
        });

        // Add CSS styling
        addStyling(form);

        // Add message display if present
        addMessageDisplay(form, request);

        // Add configuration status
        addConfigurationStatus(form);

        // Add tabs for organization
        form.addTab({
            id: 'custpage_tab_view',
            label: 'View Settlements'
        });

        form.addTab({
            id: 'custpage_tab_fetch',
            label: 'Fetch from Windcave'
        });

        // Add view/filter section
        addViewFilterSection(form, request);

        // Add manual fetch section
        addManualFetchSection(form);

        // Add settlements list based on current filter
        addSettlementsList(form, request);

        // Add summary statistics
        addSummaryStats(form, request);

        // Add buttons
        form.addSubmitButton({
            label: 'Apply Filter'
        });

        form.addButton({
            id: 'custpage_fetch',
            label: 'Fetch Settlements Now',
            functionName: 'submitFetch'
        });

        form.addButton({
            id: 'custpage_clear',
            label: 'Clear Filter',
            functionName: 'clearFilter'
        });

        // Hidden action field
        form.addField({
            id: 'custpage_action',
            type: serverWidget.FieldType.TEXT,
            label: 'Action'
        }).updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        // Add client script for button handling
        form.clientScriptModulePath = './windcave_settlement_client.js';

        response.writePage(form);
    }

    /**
     * Handles POST requests - processes form submissions
     * @param {Object} context - Request/Response context
     */
    function handlePost(context) {
        const request = context.request;
        const action = request.parameters.custpage_action;

        if (action === 'fetch') {
            // Manual fetch from Windcave
            const startDate = request.parameters.custpage_fetch_start_date;
            const endDate = request.parameters.custpage_fetch_end_date;
            const selectedConfig = request.parameters.custpage_fetch_config;

            try {
                const results = performManualFetch(startDate, endDate, selectedConfig);

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        message: 'Processed ' + results.configurationsProcessed + ' configuration(s). ' +
                                 'Fetched ' + results.settlementsProcessed + ' new settlements. ' +
                                 'Matched: ' + results.totalMatched + ', ' +
                                 'Unmatched: ' + results.totalUnmatched,
                        filter_start: startDate,
                        filter_end: endDate
                    }
                });
            } catch (e) {
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: e.message
                    }
                });
            }
        } else if (action === 'filter') {
            // Apply filter - redirect with filter parameters
            const filterStart = request.parameters.custpage_filter_start;
            const filterEnd = request.parameters.custpage_filter_end;

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    filter_start: filterStart || '',
                    filter_end: filterEnd || ''
                }
            });
        } else if (action === 'manualmatch') {
            // Manual match a transaction
            handleManualMatch(context);
            return;
        } else if (action === 'createdeposit') {
            // Create supplementary deposit
            handleCreateSupplementaryDeposit(context);
            return;
        } else if (action === 'searchtxn') {
            // Search for NS transactions (AJAX-style, returns JSON)
            handleSearchTransactions(context);
            return;
        } else {
            // Default - apply filter
            const filterStart = request.parameters.custpage_filter_start;
            const filterEnd = request.parameters.custpage_filter_end;

            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    filter_start: filterStart || '',
                    filter_end: filterEnd || ''
                }
            });
        }
    }

    /**
     * Adds CSS styling to the form
     * @param {Object} form - ServerWidget Form
     */
    function addStyling(form) {
        const styleField = form.addField({
            id: 'custpage_styles',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Styles'
        });

        styleField.defaultValue = `
            <style>
                .windcave-status-done { color: #28a745; font-weight: bold; }
                .windcave-status-pending { color: #ffc107; font-weight: bold; }
                .windcave-status-void { color: #dc3545; font-weight: bold; }
                .windcave-matched { color: #28a745; }
                .windcave-unmatched { color: #dc3545; }
                .windcave-message { padding: 12px 15px; margin: 10px 0; border-radius: 4px; }
                .windcave-success { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
                .windcave-error { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
                .windcave-info { background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
                .windcave-info-panel { background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 4px; border: 1px solid #dee2e6; }
                .windcave-summary { display: flex; flex-wrap: wrap; gap: 20px; margin: 15px 0; }
                .windcave-stat-box { background: #fff; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px 20px; min-width: 150px; text-align: center; }
                .windcave-stat-value { font-size: 24px; font-weight: bold; color: #333; }
                .windcave-stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
                .windcave-stat-box.credit { border-left: 4px solid #28a745; }
                .windcave-stat-box.debit { border-left: 4px solid #dc3545; }
                .windcave-stat-box.matched { border-left: 4px solid #007bff; }
                .windcave-stat-box.unmatched { border-left: 4px solid #ffc107; }
                .windcave-txn-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                .windcave-txn-table th, .windcave-txn-table td { padding: 8px 12px; border: 1px solid #dee2e6; text-align: left; }
                .windcave-txn-table th { background-color: #f8f9fa; font-weight: 600; }
                .windcave-txn-table tr:nth-child(even) { background-color: #f8f9fa; }
                .windcave-txn-matched { background-color: #d4edda !important; }
                .windcave-txn-unmatched { background-color: #f8d7da !important; }
            </style>
        `;
    }

    /**
     * Adds message display section
     * @param {Object} form - ServerWidget Form
     * @param {Object} request - Request object
     */
    function addMessageDisplay(form, request) {
        const message = request.parameters.message;
        const error = request.parameters.error;

        let messageHtml = '';
        if (message) {
            messageHtml = '<div class="windcave-message windcave-success">' + message + '</div>';
        }
        if (error) {
            messageHtml = '<div class="windcave-message windcave-error">Error: ' + error + '</div>';
        }

        if (messageHtml) {
            const msgField = form.addField({
                id: 'custpage_message',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Message'
            });
            msgField.defaultValue = messageHtml;
        }
    }

    /**
     * Adds configuration status section showing all configurations
     * @param {Object} form - ServerWidget Form
     */
    function addConfigurationStatus(form) {
        let configHtml = '<div class="windcave-info-panel">';
        configHtml += '<h3 style="margin-top: 0;">Active Configurations</h3>';

        try {
            const configurations = reconciliation.loadAllConfigurations();
            configHtml += '<p style="color: #28a745; margin: 5px 0;">&#10004; ' + configurations.length + ' active configuration(s)</p>';

            configHtml += '<table style="width: 100%; margin-top: 10px; border-collapse: collapse;">';
            configHtml += '<thead><tr style="background-color: #e9ecef;">';
            configHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Name</th>';
            configHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Merchant ID</th>';
            configHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Environment</th>';
            configHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Bank Account</th>';
            configHtml += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Lookback</th>';
            configHtml += '</tr></thead><tbody>';

            for (const config of configurations) {
                configHtml += '<tr>';
                configHtml += '<td style="padding: 8px; border: 1px solid #dee2e6;">' + config.name + '</td>';
                configHtml += '<td style="padding: 8px; border: 1px solid #dee2e6;">' + config.merchantId + '</td>';
                configHtml += '<td style="padding: 8px; border: 1px solid #dee2e6;">' + (config.environment === 'sec' ? 'Production' : 'UAT') + '</td>';
                configHtml += '<td style="padding: 8px; border: 1px solid #dee2e6;">' + (config.bankAccountText || config.bankAccount) + '</td>';
                configHtml += '<td style="padding: 8px; border: 1px solid #dee2e6;">' + config.lookbackDays + ' days</td>';
                configHtml += '</tr>';
            }

            configHtml += '</tbody></table>';

        } catch (e) {
            configHtml += '<p style="color: #dc3545;">&#10008; Configuration Error: ' + e.message + '</p>';
            configHtml += '<p>Please create a Windcave Configuration record.</p>';
        }

        configHtml += '</div>';

        const configField = form.addField({
            id: 'custpage_config_status',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Configuration'
        });
        configField.defaultValue = configHtml;
    }

    /**
     * Adds view/filter section for browsing settlements
     * @param {Object} form - ServerWidget Form
     * @param {Object} request - Request object
     */
    function addViewFilterSection(form, request) {
        const filterGroup = form.addFieldGroup({
            id: 'custpage_filter_group',
            label: 'Filter Settlements by Date'
        });
        filterGroup.isSingleColumn = false;

        // Get current filter values from URL parameters
        const filterStart = request.parameters.filter_start || '';
        const filterEnd = request.parameters.filter_end || '';

        const startField = form.addField({
            id: 'custpage_filter_start',
            type: serverWidget.FieldType.DATE,
            label: 'Settlement Date From',
            container: 'custpage_filter_group'
        });
        if (filterStart) {
            startField.defaultValue = filterStart;
        }

        const endField = form.addField({
            id: 'custpage_filter_end',
            type: serverWidget.FieldType.DATE,
            label: 'Settlement Date To',
            container: 'custpage_filter_group'
        });
        if (filterEnd) {
            endField.defaultValue = filterEnd;
        }

        // Add help text
        const helpField = form.addField({
            id: 'custpage_filter_help',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Help',
            container: 'custpage_filter_group'
        });
        helpField.defaultValue = '<div style="color: #666; font-size: 11px; margin-top: 5px;">' +
            'Select dates and click "Apply Filter" to view settlements for a specific date range. ' +
            'Leave empty to see all recent settlements.</div>';
    }

    /**
     * Adds manual fetch section for pulling from Windcave
     * @param {Object} form - ServerWidget Form
     */
    function addManualFetchSection(form) {
        const fetchGroup = form.addFieldGroup({
            id: 'custpage_fetch_group',
            label: 'Fetch New Settlements from Windcave'
        });
        fetchGroup.isSingleColumn = false;

        // Configuration selector
        try {
            const configurations = reconciliation.loadAllConfigurations();

            const configField = form.addField({
                id: 'custpage_fetch_config',
                type: serverWidget.FieldType.SELECT,
                label: 'Configuration',
                container: 'custpage_fetch_group'
            });

            // Add "All Configurations" option
            configField.addSelectOption({
                value: 'all',
                text: '-- All Configurations --',
                isSelected: true
            });

            // Add each configuration as an option
            for (const config of configurations) {
                configField.addSelectOption({
                    value: config.internalId,
                    text: config.name + ' (' + config.merchantId + ')'
                });
            }
        } catch (e) {
            // No configurations found - will show error in config status section
        }

        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        form.addField({
            id: 'custpage_fetch_start_date',
            type: serverWidget.FieldType.DATE,
            label: 'Fetch From Date',
            container: 'custpage_fetch_group'
        }).defaultValue = yesterday;

        form.addField({
            id: 'custpage_fetch_end_date',
            type: serverWidget.FieldType.DATE,
            label: 'Fetch To Date',
            container: 'custpage_fetch_group'
        }).defaultValue = today;

        // Add help text
        const helpField = form.addField({
            id: 'custpage_fetch_help',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Help',
            container: 'custpage_fetch_group'
        });
        helpField.defaultValue = '<div style="color: #666; font-size: 11px; margin-top: 5px;">' +
            'Select a configuration (or all) and click "Fetch Settlements Now" to pull new settlements from Windcave. ' +
            'This will create Bank Deposits for matched transactions.</div>';
    }

    /**
     * Adds summary statistics section
     * @param {Object} form - ServerWidget Form
     * @param {Object} request - Request object
     */
    function addSummaryStats(form, request) {
        const filterStart = request.parameters.filter_start || null;
        const filterEnd = request.parameters.filter_end || null;

        const settlements = reconciliation.getSettlementsByDateRange(filterStart, filterEnd, 1000);

        // Calculate totals
        let totalCredits = 0;
        let totalDebits = 0;
        let totalMatched = 0;
        let totalUnmatched = 0;
        let settlementCount = settlements.length;

        for (const s of settlements) {
            const amount = parseFloat(s.amount) || 0;
            if (s.crdr === 'CR') {
                totalCredits += amount;
            } else if (s.crdr === 'DR') {
                totalDebits += amount;
            }
            totalMatched += parseInt(s.matchedCount) || 0;
            totalUnmatched += parseInt(s.unmatchedCount) || 0;
        }

        let summaryHtml = '<div class="windcave-info-panel">';
        summaryHtml += '<h3 style="margin-top: 0;">Summary</h3>';
        summaryHtml += '<div class="windcave-summary">';

        summaryHtml += '<div class="windcave-stat-box">';
        summaryHtml += '<div class="windcave-stat-value">' + settlementCount + '</div>';
        summaryHtml += '<div class="windcave-stat-label">Settlements</div>';
        summaryHtml += '</div>';

        summaryHtml += '<div class="windcave-stat-box credit">';
        summaryHtml += '<div class="windcave-stat-value">$' + totalCredits.toFixed(2) + '</div>';
        summaryHtml += '<div class="windcave-stat-label">Total Credits</div>';
        summaryHtml += '</div>';

        summaryHtml += '<div class="windcave-stat-box debit">';
        summaryHtml += '<div class="windcave-stat-value">$' + totalDebits.toFixed(2) + '</div>';
        summaryHtml += '<div class="windcave-stat-label">Total Debits</div>';
        summaryHtml += '</div>';

        summaryHtml += '<div class="windcave-stat-box matched">';
        summaryHtml += '<div class="windcave-stat-value">' + totalMatched + '</div>';
        summaryHtml += '<div class="windcave-stat-label">Matched Txns</div>';
        summaryHtml += '</div>';

        summaryHtml += '<div class="windcave-stat-box unmatched">';
        summaryHtml += '<div class="windcave-stat-value">' + totalUnmatched + '</div>';
        summaryHtml += '<div class="windcave-stat-label">Unmatched Txns</div>';
        summaryHtml += '</div>';

        summaryHtml += '</div></div>';

        const summaryField = form.addField({
            id: 'custpage_summary',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Summary'
        });
        summaryField.defaultValue = summaryHtml;
    }

    /**
     * Adds the settlements list sublist
     * @param {Object} form - ServerWidget Form
     * @param {Object} request - Request object
     */
    function addSettlementsList(form, request) {
        const filterStart = request.parameters.filter_start || null;
        const filterEnd = request.parameters.filter_end || null;

        // Add filter indicator
        let filterIndicator = '';
        if (filterStart || filterEnd) {
            filterIndicator = ' (Filtered: ';
            if (filterStart && filterEnd) {
                filterIndicator += filterStart + ' to ' + filterEnd;
            } else if (filterStart) {
                filterIndicator += 'from ' + filterStart;
            } else {
                filterIndicator += 'to ' + filterEnd;
            }
            filterIndicator += ')';
        }

        const sublist = form.addSublist({
            id: 'custpage_settlements',
            type: serverWidget.SublistType.LIST,
            label: 'Settlements' + filterIndicator
        });

        // Add columns
        sublist.addField({
            id: 'custpage_col_date',
            type: serverWidget.FieldType.DATE,
            label: 'Settlement Date'
        });

        sublist.addField({
            id: 'custpage_col_id',
            type: serverWidget.FieldType.TEXT,
            label: 'Settlement ID'
        });

        sublist.addField({
            id: 'custpage_col_ref',
            type: serverWidget.FieldType.TEXT,
            label: 'Reference'
        });

        sublist.addField({
            id: 'custpage_col_crdr',
            type: serverWidget.FieldType.TEXT,
            label: 'CR/DR'
        });

        sublist.addField({
            id: 'custpage_col_amount',
            type: serverWidget.FieldType.CURRENCY,
            label: 'Amount'
        });

        sublist.addField({
            id: 'custpage_col_currency',
            type: serverWidget.FieldType.TEXT,
            label: 'Currency'
        });

        sublist.addField({
            id: 'custpage_col_status',
            type: serverWidget.FieldType.TEXT,
            label: 'WC Status'
        });

        sublist.addField({
            id: 'custpage_col_matched',
            type: serverWidget.FieldType.TEXT,
            label: 'Matched/Total'
        });

        sublist.addField({
            id: 'custpage_col_deposit',
            type: serverWidget.FieldType.TEXT,
            label: 'Bank Deposit'
        });

        sublist.addField({
            id: 'custpage_col_view',
            type: serverWidget.FieldType.TEXT,
            label: 'Actions'
        });

        // Populate with settlements
        const settlements = reconciliation.getSettlementsByDateRange(filterStart, filterEnd, 100);

        for (let i = 0; i < settlements.length; i++) {
            const settlement = settlements[i];

            sublist.setSublistValue({
                id: 'custpage_col_date',
                line: i,
                value: settlement.settlementDate || ''
            });

            sublist.setSublistValue({
                id: 'custpage_col_id',
                line: i,
                value: settlement.settlementId || ''
            });

            sublist.setSublistValue({
                id: 'custpage_col_ref',
                line: i,
                value: settlement.referenceNumber || '-'
            });

            // CR/DR with color coding
            const crdr = settlement.crdr || '';
            sublist.setSublistValue({
                id: 'custpage_col_crdr',
                line: i,
                value: crdr
            });

            sublist.setSublistValue({
                id: 'custpage_col_amount',
                line: i,
                value: settlement.amount || 0
            });

            sublist.setSublistValue({
                id: 'custpage_col_currency',
                line: i,
                value: settlement.currency || ''
            });

            sublist.setSublistValue({
                id: 'custpage_col_status',
                line: i,
                value: settlement.status || ''
            });

            // Matched/Total with color coding
            const matchedCount = parseInt(settlement.matchedCount) || 0;
            const unmatchedCount = parseInt(settlement.unmatchedCount) || 0;
            const totalCount = matchedCount + unmatchedCount;
            let matchText = matchedCount + '/' + totalCount;
            if (unmatchedCount > 0) {
                matchText = '<span style="color: #dc3545;">' + matchText + '</span>';
            } else if (totalCount > 0) {
                matchText = '<span style="color: #28a745;">' + matchText + '</span>';
            }
            sublist.setSublistValue({
                id: 'custpage_col_matched',
                line: i,
                value: matchText
            });

            // Bank Deposit link
            if (settlement.bankDepositId) {
                const depositUrl = url.resolveRecord({
                    recordType: 'deposit',
                    recordId: settlement.bankDepositId
                });
                sublist.setSublistValue({
                    id: 'custpage_col_deposit',
                    line: i,
                    value: '<a href="' + depositUrl + '" target="_blank">' +
                           (settlement.bankDepositText || 'Deposit #' + settlement.bankDepositId) + '</a>'
                });
            } else {
                sublist.setSublistValue({
                    id: 'custpage_col_deposit',
                    line: i,
                    value: '-'
                });
            }

            // View details link
            const detailsUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                params: {
                    action: 'viewdetails',
                    settlementId: settlement.internalId
                }
            });
            sublist.setSublistValue({
                id: 'custpage_col_view',
                line: i,
                value: '<a href="' + detailsUrl + '">View Details</a>'
            });
        }
    }

    /**
     * Displays settlement details page with all transactions
     * @param {Object} context - Request/Response context
     */
    function displaySettlementDetails(context) {
        const request = context.request;
        const response = context.response;
        const settlementId = request.parameters.settlementId;
        const messageParam = request.parameters.message;
        const errorParam = request.parameters.error;

        // Get settlement info
        const settlement = reconciliation.getSettlementById(settlementId);

        const form = serverWidget.createForm({
            title: 'Settlement Details: ' + (settlement ? settlement.settlementId : settlementId)
        });

        // Add styling
        addStyling(form);
        addDetailsPageStyling(form);

        // Add back button
        form.addButton({
            id: 'custpage_back',
            label: 'Back to Dashboard',
            functionName: 'goBack'
        });

        // Show message/error if present
        if (messageParam || errorParam) {
            const msgField = form.addField({
                id: 'custpage_detail_message',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Message'
            });
            if (messageParam) {
                msgField.defaultValue = '<div class="windcave-message windcave-success">' + messageParam + '</div>';
            } else if (errorParam) {
                msgField.defaultValue = '<div class="windcave-message windcave-error">Error: ' + errorParam + '</div>';
            }
        }

        if (!settlement) {
            const errorField = form.addField({
                id: 'custpage_error',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Error'
            });
            errorField.defaultValue = '<div class="windcave-message windcave-error">Settlement not found.</div>';
            response.writePage(form);
            return;
        }

        // Settlement header info
        let headerHtml = '<div class="windcave-info-panel">';
        headerHtml += '<h3 style="margin-top: 0;">Settlement Information</h3>';
        headerHtml += '<table style="width: 100%;">';
        headerHtml += '<tr><td style="width: 200px;"><strong>Settlement ID:</strong></td><td>' + settlement.settlementId + '</td></tr>';
        headerHtml += '<tr><td><strong>Settlement Date:</strong></td><td>' + format.format({ value: settlement.settlementDate, type: format.Type.DATE }) + '</td></tr>';
        headerHtml += '<tr><td><strong>Reference Number:</strong></td><td>' + (settlement.referenceNumber || '-') + '</td></tr>';
        headerHtml += '<tr><td><strong>Amount:</strong></td><td>' + (settlement.crdr === 'CR' ? '+' : '-') + ' $' + parseFloat(settlement.amount).toFixed(2) + ' ' + settlement.currency + '</td></tr>';
        headerHtml += '<tr><td><strong>Type:</strong></td><td>' + (settlement.crdr === 'CR' ? 'Credit' : 'Debit') + '</td></tr>';
        headerHtml += '<tr><td><strong>Status:</strong></td><td>' + settlement.status + '</td></tr>';
        headerHtml += '<tr><td><strong>Matched Amount:</strong></td><td>$' + parseFloat(settlement.matchedAmount || 0).toFixed(2) + '</td></tr>';
        headerHtml += '<tr><td><strong>Transactions:</strong></td><td>' + (settlement.matchedCount || 0) + ' matched, ' + (settlement.unmatchedCount || 0) + ' unmatched</td></tr>';

        if (settlement.errorMessage) {
            headerHtml += '<tr><td><strong>Notes:</strong></td><td style="color: #856404;">' + settlement.errorMessage + '</td></tr>';
        }

        headerHtml += '</table></div>';

        const headerField = form.addField({
            id: 'custpage_header',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Header'
        });
        headerField.defaultValue = headerHtml;

        // Deposits section
        const deposits = reconciliation.getDepositsForSettlement(settlementId);
        const pendingDepositTxns = reconciliation.getMatchedNotDepositedTransactions(settlementId);

        let depositsHtml = '<div class="windcave-info-panel">';
        depositsHtml += '<h3 style="margin-top: 0;">Bank Deposits</h3>';

        if (deposits.length === 0 && pendingDepositTxns.length === 0) {
            depositsHtml += '<p style="color: #666;">No deposits created yet.</p>';
        } else {
            if (deposits.length > 0) {
                depositsHtml += '<table class="windcave-txn-table" style="margin-bottom: 15px;">';
                depositsHtml += '<thead><tr>';
                depositsHtml += '<th>Deposit</th>';
                depositsHtml += '<th>Amount</th>';
                depositsHtml += '<th>Transactions</th>';
                depositsHtml += '<th>Action</th>';
                depositsHtml += '</tr></thead><tbody>';

                for (const dep of deposits) {
                    const depositUrl = url.resolveRecord({
                        recordType: 'deposit',
                        recordId: dep.depositId
                    });
                    depositsHtml += '<tr>';
                    depositsHtml += '<td>' + dep.depositText + '</td>';
                    depositsHtml += '<td>$' + dep.amount.toFixed(2) + '</td>';
                    depositsHtml += '<td>' + dep.transactionCount + ' transaction(s)</td>';
                    depositsHtml += '<td><a href="' + depositUrl + '" target="_blank">View in NetSuite</a></td>';
                    depositsHtml += '</tr>';
                }

                depositsHtml += '</tbody></table>';
            }

            // Show pending deposit button if there are matched but not deposited transactions
            if (pendingDepositTxns.length > 0) {
                const createDepositUrl = url.resolveScript({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    params: {
                        custpage_action: 'createdeposit',
                        settlementId: settlementId
                    }
                });

                let pendingAmount = 0;
                for (const t of pendingDepositTxns) {
                    pendingAmount += t.amount;
                }

                depositsHtml += '<div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px;">';
                depositsHtml += '<strong>' + pendingDepositTxns.length + ' matched transaction(s)</strong> totaling <strong>$' + pendingAmount.toFixed(2) + '</strong> are ready for deposit.';
                depositsHtml += '<br><br>';
                depositsHtml += '<form method="POST" action="' + createDepositUrl + '" style="display: inline;">';
                depositsHtml += '<input type="hidden" name="custpage_action" value="createdeposit">';
                depositsHtml += '<input type="hidden" name="settlementId" value="' + settlementId + '">';
                depositsHtml += '<button type="submit" class="windcave-btn windcave-btn-primary">Create Supplementary Deposit</button>';
                depositsHtml += '</form>';
                depositsHtml += '</div>';
            }
        }

        depositsHtml += '</div>';

        const depositsField = form.addField({
            id: 'custpage_deposits',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Deposits'
        });
        depositsField.defaultValue = depositsHtml;

        // Get all transactions for this settlement
        const transactions = reconciliation.getAllTransactionsForSettlement(settlementId);

        // Build the suitelet URL for manual matching
        const suiteletUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        // Transaction details table
        let txnHtml = '<div class="windcave-info-panel">';
        txnHtml += '<h3 style="margin-top: 0;">Transactions (' + transactions.length + ')</h3>';

        if (transactions.length === 0) {
            txnHtml += '<p>No transaction details available.</p>';
        } else {
            txnHtml += '<table class="windcave-txn-table">';
            txnHtml += '<thead><tr>';
            txnHtml += '<th>Transaction ID</th>';
            txnHtml += '<th>Type</th>';
            txnHtml += '<th>Amount</th>';
            txnHtml += '<th>Method</th>';
            txnHtml += '<th>Auth Code</th>';
            txnHtml += '<th>Merchant Ref</th>';
            txnHtml += '<th>NS Transaction</th>';
            txnHtml += '<th>Status</th>';
            txnHtml += '<th>Action</th>';
            txnHtml += '</tr></thead><tbody>';

            for (const txn of transactions) {
                const isMatched = txn.matched === true || txn.matched === 'T';
                const inDeposit = txn.inDeposit === true || txn.inDeposit === 'T';
                let rowClass = '';
                if (isMatched && inDeposit) {
                    rowClass = 'windcave-txn-deposited';
                } else if (isMatched) {
                    rowClass = 'windcave-txn-matched';
                } else {
                    rowClass = 'windcave-txn-unmatched';
                }

                txnHtml += '<tr class="' + rowClass + '">';
                txnHtml += '<td>' + txn.transactionId + '</td>';
                txnHtml += '<td>' + txn.type + '</td>';
                txnHtml += '<td>$' + parseFloat(txn.amount).toFixed(2) + ' ' + txn.currency + '</td>';
                txnHtml += '<td>' + (txn.method || '-') + '</td>';
                txnHtml += '<td>' + (txn.authCode || '-') + '</td>';
                txnHtml += '<td>' + (txn.merchantReference || '-') + '</td>';

                // NS Transaction link or manual match dropdown
                if (txn.nsTransactionId) {
                    const nsUrl = url.resolveRecord({
                        recordType: 'transaction',
                        recordId: txn.nsTransactionId
                    });
                    txnHtml += '<td><a href="' + nsUrl + '" target="_blank">' + (txn.nsTransactionText || txn.nsTransactionId) + '</a></td>';
                } else {
                    txnHtml += '<td>-</td>';
                }

                // Status
                if (isMatched) {
                    if (inDeposit) {
                        txnHtml += '<td style="color: #28a745;">&#10004; Deposited</td>';
                    } else {
                        txnHtml += '<td style="color: #17a2b8;">&#10004; Matched (pending deposit)</td>';
                    }
                } else {
                    txnHtml += '<td style="color: #dc3545;">&#10008; ' + (txn.matchError || 'Unmatched') + '</td>';
                }

                // Action column
                if (!isMatched) {
                    // Show manual match form for unmatched transactions
                    txnHtml += '<td>';
                    txnHtml += '<form method="POST" action="' + suiteletUrl + '" class="manual-match-form">';
                    txnHtml += '<input type="hidden" name="custpage_action" value="manualmatch">';
                    txnHtml += '<input type="hidden" name="txnDetailId" value="' + txn.internalId + '">';
                    txnHtml += '<input type="hidden" name="settlementId" value="' + settlementId + '">';
                    txnHtml += '<div class="match-input-group">';
                    txnHtml += '<input type="text" name="nsTransactionId" placeholder="NS Transaction ID" class="match-input" required>';
                    txnHtml += '<button type="submit" class="windcave-btn windcave-btn-sm">Match</button>';
                    txnHtml += '</div>';
                    txnHtml += '<div class="match-help">Enter payment/cash sale internal ID</div>';
                    txnHtml += '</form>';
                    txnHtml += '</td>';
                } else {
                    txnHtml += '<td>-</td>';
                }

                txnHtml += '</tr>';
            }

            txnHtml += '</tbody></table>';
        }

        txnHtml += '</div>';

        const txnField = form.addField({
            id: 'custpage_transactions',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Transactions'
        });
        txnField.defaultValue = txnHtml;

        // Add client script
        form.clientScriptModulePath = './windcave_settlement_client.js';

        response.writePage(form);
    }

    /**
     * Adds additional styling for the details page
     * @param {Object} form - ServerWidget Form
     */
    function addDetailsPageStyling(form) {
        const styleField = form.addField({
            id: 'custpage_detail_styles',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Detail Styles'
        });

        styleField.defaultValue = `
            <style>
                .windcave-txn-deposited { background-color: #d4edda !important; }
                .windcave-txn-matched { background-color: #d1ecf1 !important; }
                .windcave-txn-unmatched { background-color: #f8d7da !important; }
                .windcave-btn {
                    display: inline-block;
                    padding: 6px 12px;
                    font-size: 13px;
                    font-weight: 500;
                    text-align: center;
                    white-space: nowrap;
                    vertical-align: middle;
                    cursor: pointer;
                    border: 1px solid transparent;
                    border-radius: 4px;
                    text-decoration: none;
                }
                .windcave-btn-primary {
                    color: #fff;
                    background-color: #007bff;
                    border-color: #007bff;
                }
                .windcave-btn-primary:hover {
                    background-color: #0056b3;
                    border-color: #004085;
                }
                .windcave-btn-sm {
                    padding: 3px 8px;
                    font-size: 12px;
                }
                .match-input-group {
                    display: flex;
                    gap: 5px;
                    align-items: center;
                }
                .match-input {
                    width: 120px;
                    padding: 4px 8px;
                    font-size: 12px;
                    border: 1px solid #ced4da;
                    border-radius: 3px;
                }
                .match-help {
                    font-size: 10px;
                    color: #6c757d;
                    margin-top: 3px;
                }
                .manual-match-form {
                    margin: 0;
                }
            </style>
        `;
    }

    /**
     * Performs a manual settlement fetch from Windcave
     * @param {string} startDate - Start date string
     * @param {string} endDate - End date string
     * @param {string} configId - Configuration ID ('all' for all configs, or specific internal ID)
     * @returns {Object} Processing results
     */
    function performManualFetch(startDate, endDate, configId) {
        const results = {
            settlementsProcessed: 0,
            totalMatched: 0,
            totalUnmatched: 0,
            configurationsProcessed: 0
        };

        // Format dates for API
        const startDateObj = format.parse({
            value: startDate,
            type: format.Type.DATE
        });
        const endDateObj = format.parse({
            value: endDate,
            type: format.Type.DATE
        });

        const formattedStart = windcaveApi.formatDateForApi(startDateObj);
        const formattedEnd = windcaveApi.formatDateForApi(endDateObj);

        // Get configurations to process
        let configurations = [];
        if (configId === 'all' || !configId) {
            configurations = reconciliation.loadAllConfigurations();
        } else {
            const singleConfig = reconciliation.loadConfigurationById(configId);
            if (singleConfig) {
                configurations = [singleConfig];
            }
        }

        // Process each configuration
        for (const config of configurations) {
            log.audit({
                title: SCRIPT_NAME + '.performManualFetch',
                details: 'Processing configuration: ' + config.name + ' (' + config.merchantId + ')'
            });

            try {
                // Fetch settlements from Windcave for this configuration
                const settlementsResponse = windcaveApi.getSettlements({
                    username: config.apiUsername,
                    password: config.apiPassword,
                    environment: config.environment,
                    merchantId: config.merchantId,
                    customerId: config.customerId,
                    startDate: formattedStart,
                    endDate: formattedEnd
                });

                const settlements = settlementsResponse.settlements || [];

                // Process each settlement
                for (const settlement of settlements) {
                    // Skip if not Done or already processed
                    if (settlement.status !== constants.SETTLEMENT_STATUS.DONE) continue;
                    if (reconciliation.isSettlementProcessed(settlement.id)) continue;

                    // Fetch details
                    const settlementDetails = windcaveApi.getSettlementDetails({
                        username: config.apiUsername,
                        password: config.apiPassword,
                        environment: config.environment,
                        settlementId: settlement.id
                    });

                    // Create settlement record
                    const settlementInternalId = reconciliation.createSettlementRecord(settlementDetails);

                    // Match transactions
                    const transactions = settlementDetails.transactions || [];
                    const matchResults = reconciliation.matchTransactions(transactions, settlementInternalId);

                    // Calculate matched amount
                    let matchedAmount = 0;
                    for (const match of matchResults.matched) {
                        matchedAmount += parseFloat(match.windcaveTxn.amount);
                    }

                    // Create bank deposit
                    let bankDepositId = null;
                    if (settlement.CRDR === constants.CRDR.CREDIT && matchResults.matched.length > 0) {
                        bankDepositId = reconciliation.createBankDeposit({
                            settlementData: settlementDetails,
                            matchedTransactions: matchResults.matched,
                            bankAccountId: config.bankAccount
                        });
                    }

                    // Update settlement record
                    let errorMessage = null;
                    if (matchResults.unmatched.length > 0) {
                        errorMessage = 'Unmatched: ' + matchResults.unmatched.length + ' transactions';
                    }

                    reconciliation.updateSettlementRecord({
                        settlementInternalId: settlementInternalId,
                        matchedCount: matchResults.matched.length,
                        unmatchedCount: matchResults.unmatched.length,
                        matchedAmount: matchedAmount,
                        bankDepositId: bankDepositId,
                        errorMessage: errorMessage
                    });

                    results.settlementsProcessed++;
                    results.totalMatched += matchResults.matched.length;
                    results.totalUnmatched += matchResults.unmatched.length;
                }

                results.configurationsProcessed++;

            } catch (configError) {
                log.error({
                    title: SCRIPT_NAME + '.performManualFetch',
                    details: 'Error processing configuration ' + config.name + ': ' + configError.message
                });
                // Continue with next configuration
            }
        }

        return results;
    }

    /**
     * Handles manual match POST request
     * @param {Object} context - Request/Response context
     */
    function handleManualMatch(context) {
        const request = context.request;
        const txnDetailId = request.parameters.txnDetailId;
        const nsTransactionId = request.parameters.nsTransactionId;
        const settlementId = request.parameters.settlementId;

        const result = reconciliation.manualMatchTransaction(txnDetailId, nsTransactionId);

        redirect.toSuitelet({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            parameters: {
                action: 'viewdetails',
                settlementId: settlementId,
                message: result.success ? 'Transaction matched successfully' : null,
                error: result.success ? null : result.error
            }
        });
    }

    /**
     * Handles create supplementary deposit POST request
     * @param {Object} context - Request/Response context
     */
    function handleCreateSupplementaryDeposit(context) {
        const request = context.request;
        const settlementId = request.parameters.settlementId;

        // Get bank account from configuration
        let bankAccountId = null;
        try {
            const configs = reconciliation.loadAllConfigurations();
            if (configs.length > 0) {
                bankAccountId = configs[0].bankAccount;
            }
        } catch (e) {
            redirect.toSuitelet({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                parameters: {
                    action: 'viewdetails',
                    settlementId: settlementId,
                    error: 'Could not load configuration: ' + e.message
                }
            });
            return;
        }

        const result = reconciliation.createSupplementaryDeposit(settlementId, bankAccountId);

        redirect.toSuitelet({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            parameters: {
                action: 'viewdetails',
                settlementId: settlementId,
                message: result.success ?
                    'Created supplementary deposit with ' + result.paymentsAdded + ' payment(s)' : null,
                error: result.success ? null : result.error
            }
        });
    }

    /**
     * Handles transaction search request (returns JSON)
     * @param {Object} context - Request/Response context
     */
    function handleSearchTransactions(context) {
        const request = context.request;
        const response = context.response;
        const searchText = request.parameters.searchText || '';
        const amount = request.parameters.amount ? parseFloat(request.parameters.amount) : null;

        try {
            const results = reconciliation.searchNetSuiteTransactions({
                searchText: searchText,
                amount: amount
            });

            response.setHeader({
                name: 'Content-Type',
                value: 'application/json'
            });
            response.write(JSON.stringify({ success: true, results: results }));
        } catch (e) {
            response.setHeader({
                name: 'Content-Type',
                value: 'application/json'
            });
            response.write(JSON.stringify({ success: false, error: e.message }));
        }
    }

    return {
        onRequest: onRequest
    };
});
