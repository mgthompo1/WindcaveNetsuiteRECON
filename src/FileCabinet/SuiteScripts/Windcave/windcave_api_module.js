/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Windcave Settlement Integration - API Communication Module
 * Handles all communication with the Windcave Settlement REST API.
 */
define(['N/https', 'N/encode', 'N/log', './windcave_constants'],
    function(https, encode, log, constants) {

        const MODULE_NAME = 'WindcaveAPI';

        /**
         * Builds the Base64 encoded Basic Auth header value
         * @param {string} username - API username
         * @param {string} password - API password
         * @returns {string} Base64 encoded credentials
         */
        function buildAuthHeader(username, password) {
            const credentials = username + ':' + password;
            return 'Basic ' + encode.convert({
                string: credentials,
                inputEncoding: encode.Encoding.UTF_8,
                outputEncoding: encode.Encoding.BASE_64
            });
        }

        /**
         * Gets the base URL based on environment
         * @param {string} environment - 'sec' for production or 'uat' for testing
         * @returns {string} Base API URL
         */
        function getBaseUrl(environment) {
            if (environment === constants.API.ENVIRONMENTS.UAT) {
                return constants.API.BASE_URL_UAT;
            }
            return constants.API.BASE_URL_PROD;
        }

        /**
         * Makes an HTTP GET request to the Windcave API with retry logic
         * @param {Object} options - Request options
         * @param {string} options.url - Full URL to request
         * @param {string} options.authHeader - Authorization header value
         * @param {number} [options.retryCount=0] - Current retry attempt
         * @returns {Object} Parsed JSON response
         * @throws {Error} If request fails after retries
         */
        function makeRequest(options) {
            const { url, authHeader, retryCount = 0 } = options;

            try {
                log.debug({
                    title: MODULE_NAME + '.makeRequest',
                    details: 'Requesting: ' + url + ' (attempt ' + (retryCount + 1) + ')'
                });

                const response = https.get({
                    url: url,
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });

                const statusCode = response.code;
                const body = response.body;

                log.debug({
                    title: MODULE_NAME + '.makeRequest',
                    details: 'Response code: ' + statusCode
                });

                // Handle success responses
                if (statusCode >= 200 && statusCode < 300) {
                    return JSON.parse(body);
                }

                // Handle authentication errors (no retry)
                if (statusCode === 401 || statusCode === 403) {
                    throw new Error(constants.ERRORS.API_AUTH_FAILED + ': ' + body);
                }

                // Handle server errors with retry
                if (statusCode >= 500 && retryCount < constants.MISC.MAX_API_RETRIES) {
                    log.audit({
                        title: MODULE_NAME + '.makeRequest',
                        details: 'Server error, retrying... (' + (retryCount + 1) + '/' + constants.MISC.MAX_API_RETRIES + ')'
                    });

                    // Simple delay using a synchronous approach
                    const startTime = new Date().getTime();
                    while (new Date().getTime() < startTime + constants.MISC.RETRY_DELAY_MS * (retryCount + 1)) {
                        // Wait
                    }

                    return makeRequest({
                        url: url,
                        authHeader: authHeader,
                        retryCount: retryCount + 1
                    });
                }

                // All other errors
                throw new Error(constants.ERRORS.API_REQUEST_FAILED + ': HTTP ' + statusCode + ' - ' + body);

            } catch (e) {
                if (e.name === 'SSS_REQUEST_TIME_EXCEEDED' && retryCount < constants.MISC.MAX_API_RETRIES) {
                    log.audit({
                        title: MODULE_NAME + '.makeRequest',
                        details: 'Request timeout, retrying... (' + (retryCount + 1) + '/' + constants.MISC.MAX_API_RETRIES + ')'
                    });

                    return makeRequest({
                        url: url,
                        authHeader: authHeader,
                        retryCount: retryCount + 1
                    });
                }

                log.error({
                    title: MODULE_NAME + '.makeRequest',
                    details: 'Request failed: ' + e.message
                });
                throw e;
            }
        }

        /**
         * Searches for settlements within a date range
         * @param {Object} options - Search options
         * @param {string} options.username - API username
         * @param {string} options.password - API password
         * @param {string} options.environment - API environment (sec/uat)
         * @param {string} [options.merchantId] - Merchant ID to filter by
         * @param {string} [options.customerId] - Customer ID to filter by
         * @param {string} options.startDate - Start date (YYYY-MM-DD)
         * @param {string} options.endDate - End date (YYYY-MM-DD)
         * @returns {Object} Settlement search response
         */
        function getSettlements(options) {
            const { username, password, environment, merchantId, customerId, startDate, endDate } = options;

            // Build the query URL
            let url = getBaseUrl(environment) + constants.API.ENDPOINTS.SETTLEMENTS + '?';

            // Add merchant or customer ID
            if (customerId) {
                url += 'customerId=' + encodeURIComponent(customerId);
            } else if (merchantId) {
                url += 'merchantId=' + encodeURIComponent(merchantId);
            } else {
                throw new Error('Either merchantId or customerId must be provided');
            }

            // Add date range
            url += '&settlementDateStart=' + encodeURIComponent(startDate);
            url += '&settlementDateEnd=' + encodeURIComponent(endDate);

            log.audit({
                title: MODULE_NAME + '.getSettlements',
                details: 'Fetching settlements from ' + startDate + ' to ' + endDate
            });

            const authHeader = buildAuthHeader(username, password);
            const response = makeRequest({ url, authHeader });

            log.audit({
                title: MODULE_NAME + '.getSettlements',
                details: 'Found ' + (response.settlements ? response.settlements.length : 0) + ' settlements'
            });

            return response;
        }

        /**
         * Gets detailed transaction information for a specific settlement
         * @param {Object} options - Query options
         * @param {string} options.username - API username
         * @param {string} options.password - API password
         * @param {string} options.environment - API environment (sec/uat)
         * @param {string} options.settlementId - Settlement ID to query
         * @returns {Object} Settlement detail response with transactions
         */
        function getSettlementDetails(options) {
            const { username, password, environment, settlementId } = options;

            const url = getBaseUrl(environment) + constants.API.ENDPOINTS.SETTLEMENTS + '/' + encodeURIComponent(settlementId);

            log.audit({
                title: MODULE_NAME + '.getSettlementDetails',
                details: 'Fetching details for settlement: ' + settlementId
            });

            const authHeader = buildAuthHeader(username, password);
            const response = makeRequest({ url, authHeader });

            log.audit({
                title: MODULE_NAME + '.getSettlementDetails',
                details: 'Found ' + (response.transactions ? response.transactions.length : 0) + ' transactions'
            });

            return response;
        }

        /**
         * Formats a date as YYYY-MM-DD for API requests
         * @param {Date} date - Date to format
         * @returns {string} Formatted date string
         */
        function formatDateForApi(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return year + '-' + month + '-' + day;
        }

        /**
         * Calculates the date range for settlement search based on lookback days
         * @param {number} lookbackDays - Number of days to look back
         * @returns {Object} Object with startDate and endDate strings
         */
        function calculateDateRange(lookbackDays) {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - lookbackDays);

            return {
                startDate: formatDateForApi(startDate),
                endDate: formatDateForApi(endDate)
            };
        }

        /**
         * Parses ISO 8601 datetime string to NetSuite Date
         * @param {string} isoString - ISO 8601 datetime string (e.g., "2025-09-15T21:54:18Z")
         * @returns {Date} JavaScript Date object
         */
        function parseIsoDateTime(isoString) {
            if (!isoString) return null;
            return new Date(isoString);
        }

        return {
            buildAuthHeader,
            getBaseUrl,
            getSettlements,
            getSettlementDetails,
            formatDateForApi,
            calculateDateRange,
            parseIsoDateTime
        };
    });
