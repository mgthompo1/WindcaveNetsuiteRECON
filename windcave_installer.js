/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Windcave Settlement Integration - Installation Verification Script
 *
 * Run this script from the SuiteScript Debugger to verify your installation
 * or to help diagnose configuration issues.
 *
 * Usage:
 * 1. Go to Customization > Scripting > Scripts > New
 * 2. Upload this file and create a Scheduled Script
 * 3. Deploy the script
 * 4. Go to the deployment and click "Run Now"
 * 5. Check the Execution Log for results
 */
define(['N/record', 'N/search', 'N/file', 'N/log', 'N/runtime', 'N/email'],
    function(record, search, file, log, runtime, email) {

        const REQUIRED_RECORDS = [
            'customrecord_windcave_config',
            'customrecord_windcave_settlement',
            'customrecord_windcave_txn_detail'
        ];

        const REQUIRED_FILES = [
            '/SuiteScripts/Windcave/windcave_constants.js',
            '/SuiteScripts/Windcave/windcave_api_module.js',
            '/SuiteScripts/Windcave/windcave_reconciliation_lib.js',
            '/SuiteScripts/Windcave/windcave_settlement_scheduled.js',
            '/SuiteScripts/Windcave/windcave_settlement_suitelet.js',
            '/SuiteScripts/Windcave/windcave_settlement_client.js'
        ];

        function execute(context) {
            log.audit('INSTALLER', '='.repeat(60));
            log.audit('INSTALLER', 'Windcave Settlement Integration - Installation Verification');
            log.audit('INSTALLER', '='.repeat(60));

            const results = {
                customRecords: { passed: 0, failed: 0, details: [] },
                scriptFiles: { passed: 0, failed: 0, details: [] },
                configuration: { passed: false, details: '' },
                permissions: { passed: false, details: '' }
            };

            // Check Custom Records
            log.audit('INSTALLER', '\n--- Checking Custom Records ---');
            for (const recordType of REQUIRED_RECORDS) {
                try {
                    const testSearch = search.create({
                        type: recordType,
                        columns: ['internalid'],
                        filters: []
                    });
                    testSearch.run().getRange({ start: 0, end: 1 });
                    log.audit('INSTALLER', '✓ ' + recordType + ' - EXISTS');
                    results.customRecords.passed++;
                    results.customRecords.details.push({ record: recordType, status: 'OK' });
                } catch (e) {
                    log.error('INSTALLER', '✗ ' + recordType + ' - MISSING or ERROR: ' + e.message);
                    results.customRecords.failed++;
                    results.customRecords.details.push({ record: recordType, status: 'MISSING', error: e.message });
                }
            }

            // Check Script Files
            log.audit('INSTALLER', '\n--- Checking Script Files ---');
            for (const filePath of REQUIRED_FILES) {
                try {
                    const scriptFile = file.load({ id: filePath });
                    log.audit('INSTALLER', '✓ ' + filePath + ' - EXISTS (' + scriptFile.size + ' bytes)');
                    results.scriptFiles.passed++;
                    results.scriptFiles.details.push({ file: filePath, status: 'OK', size: scriptFile.size });
                } catch (e) {
                    log.error('INSTALLER', '✗ ' + filePath + ' - MISSING');
                    results.scriptFiles.failed++;
                    results.scriptFiles.details.push({ file: filePath, status: 'MISSING' });
                }
            }

            // Check Configuration
            log.audit('INSTALLER', '\n--- Checking Configuration ---');
            try {
                const configSearch = search.create({
                    type: 'customrecord_windcave_config',
                    filters: [['custrecord_wc_is_active', 'is', 'T']],
                    columns: [
                        'custrecord_wc_merchant_id',
                        'custrecord_wc_environment',
                        'custrecord_wc_bank_account',
                        'custrecord_wc_api_username'
                    ]
                });

                const configResults = configSearch.run().getRange({ start: 0, end: 1 });

                if (configResults.length === 0) {
                    log.warn('INSTALLER', '⚠ No active configuration found');
                    results.configuration.details = 'No active configuration record. Please create one.';
                } else {
                    const config = configResults[0];
                    const merchantId = config.getValue('custrecord_wc_merchant_id');
                    const environment = config.getValue('custrecord_wc_environment');
                    const bankAccount = config.getText('custrecord_wc_bank_account');
                    const apiUser = config.getValue('custrecord_wc_api_username');

                    if (merchantId && environment && bankAccount && apiUser) {
                        log.audit('INSTALLER', '✓ Configuration is complete');
                        log.audit('INSTALLER', '  - Merchant ID: ' + merchantId);
                        log.audit('INSTALLER', '  - Environment: ' + environment);
                        log.audit('INSTALLER', '  - Bank Account: ' + bankAccount);
                        log.audit('INSTALLER', '  - API Username: ' + (apiUser ? 'Set' : 'Missing'));
                        results.configuration.passed = true;
                        results.configuration.details = 'Configuration complete';
                    } else {
                        log.warn('INSTALLER', '⚠ Configuration is incomplete');
                        results.configuration.details = 'Missing required fields in configuration';
                    }
                }
            } catch (e) {
                log.error('INSTALLER', '✗ Configuration check failed: ' + e.message);
                results.configuration.details = 'Error: ' + e.message;
            }

            // Check Permissions
            log.audit('INSTALLER', '\n--- Checking Permissions ---');
            try {
                // Try to create a test record to verify permissions
                const testRecord = record.create({
                    type: 'customrecord_windcave_settlement',
                    isDynamic: true
                });
                // Don't save, just verify we can create
                log.audit('INSTALLER', '✓ Can create Windcave Settlement records');
                results.permissions.passed = true;
                results.permissions.details = 'Permissions OK';
            } catch (e) {
                log.error('INSTALLER', '✗ Permission check failed: ' + e.message);
                results.permissions.details = 'Error: ' + e.message;
            }

            // Summary
            log.audit('INSTALLER', '\n' + '='.repeat(60));
            log.audit('INSTALLER', 'INSTALLATION SUMMARY');
            log.audit('INSTALLER', '='.repeat(60));

            const allPassed =
                results.customRecords.failed === 0 &&
                results.scriptFiles.failed === 0 &&
                results.configuration.passed &&
                results.permissions.passed;

            if (allPassed) {
                log.audit('INSTALLER', '✓ ALL CHECKS PASSED - Installation is complete!');
                log.audit('INSTALLER', '\nNext Steps:');
                log.audit('INSTALLER', '1. Access the dashboard via the Suitelet URL');
                log.audit('INSTALLER', '2. Test with a manual fetch');
                log.audit('INSTALLER', '3. Verify the scheduled script deployment');
            } else {
                log.error('INSTALLER', '✗ SOME CHECKS FAILED - Please review the errors above');

                if (results.customRecords.failed > 0) {
                    log.error('INSTALLER', '- Create missing custom records');
                }
                if (results.scriptFiles.failed > 0) {
                    log.error('INSTALLER', '- Upload missing script files to /SuiteScripts/Windcave/');
                }
                if (!results.configuration.passed) {
                    log.error('INSTALLER', '- Create/complete the Windcave Configuration record');
                }
                if (!results.permissions.passed) {
                    log.error('INSTALLER', '- Check role permissions for custom records');
                }
            }

            log.audit('INSTALLER', '\n' + '='.repeat(60));

            return results;
        }

        return {
            execute: execute
        };
    });
