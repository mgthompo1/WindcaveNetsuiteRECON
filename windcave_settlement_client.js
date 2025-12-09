/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Windcave Settlement Integration - Client Script
 * Handles client-side interactions for the settlement dashboard.
 */
define(['N/currentRecord', 'N/ui/dialog', 'N/url'], function(currentRecord, dialog, url) {

    /**
     * Page initialization
     * @param {Object} context - Script context
     */
    function pageInit(context) {
        // Page initialization logic if needed
    }

    /**
     * Handles the Fetch Settlements button click
     */
    function submitFetch() {
        const record = currentRecord.get();

        const startDate = record.getValue({ fieldId: 'custpage_fetch_start_date' });
        const endDate = record.getValue({ fieldId: 'custpage_fetch_end_date' });

        if (!startDate || !endDate) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Please select both Fetch From Date and Fetch To Date.'
            });
            return;
        }

        if (startDate > endDate) {
            dialog.alert({
                title: 'Validation Error',
                message: 'Fetch From Date must be before or equal to Fetch To Date.'
            });
            return;
        }

        // Confirm before fetching
        dialog.confirm({
            title: 'Confirm Fetch',
            message: 'This will fetch settlements from Windcave for the selected date range and create Bank Deposits for matched transactions. Continue?'
        }).then(function(result) {
            if (result) {
                // Set action and submit
                record.setValue({ fieldId: 'custpage_action', value: 'fetch' });

                // Submit the form
                document.forms[0].submit();
            }
        });
    }

    /**
     * Clears the filter and shows all settlements
     */
    function clearFilter() {
        const record = currentRecord.get();

        // Clear the filter fields
        record.setValue({ fieldId: 'custpage_filter_start', value: '' });
        record.setValue({ fieldId: 'custpage_filter_end', value: '' });

        // Redirect to the page without filter parameters
        const currentUrl = window.location.href.split('?')[0];
        const scriptId = window.location.href.match(/script=(\d+)/);
        const deployId = window.location.href.match(/deploy=(\d+)/);

        if (scriptId && deployId) {
            window.location.href = currentUrl + '?script=' + scriptId[1] + '&deploy=' + deployId[1];
        } else {
            // Fallback - just reload without parameters
            window.location.href = currentUrl;
        }
    }

    /**
     * Navigate back to dashboard
     */
    function goBack() {
        history.back();
    }

    /**
     * Confirm before creating supplementary deposit
     * @param {string} formId - Form element ID
     */
    function confirmSupplementaryDeposit(formId) {
        dialog.confirm({
            title: 'Create Supplementary Deposit',
            message: 'This will create a new Bank Deposit for the matched transactions that are not yet deposited. Continue?'
        }).then(function(result) {
            if (result) {
                document.getElementById(formId).submit();
            }
        });
    }

    return {
        pageInit: pageInit,
        submitFetch: submitFetch,
        clearFilter: clearFilter,
        goBack: goBack,
        confirmSupplementaryDeposit: confirmSupplementaryDeposit
    };
});
