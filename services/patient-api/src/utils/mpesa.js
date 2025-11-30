const axios = require('axios');
const { logger } = require('./logger');

/**
 * M-Pesa Daraja API Integration Utility
 * Implements STK Push (Lipa Na M-Pesa Online) for healthcare payments
 */

class MpesaService {
  constructor() {
    // Load configuration from environment variables
    this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'production'
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.passkey = process.env.MPESA_PASSKEY;
    this.shortCode = process.env.MPESA_SHORTCODE;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    
    // API URLs
    this.baseUrl = this.environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    
    this.authUrl = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
    this.stkPushUrl = `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
    this.queryUrl = `${this.baseUrl}/mpesa/stkpushquery/v1/query`;
    
    // Cache for access token
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Generate M-Pesa API access token
   */
  async getAccessToken() {
    try {
      // Return cached token if still valid
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      const response = await axios.get(this.authUrl, {
        headers: {
          Authorization: `Basic ${auth}`
        }
      });

      this.accessToken = response.data.access_token;
      // Token expires in 3599 seconds, cache for 3500 seconds to be safe
      this.tokenExpiry = Date.now() + (3500 * 1000);
      
      logger.info('M-Pesa access token generated successfully');
      return this.accessToken;
    } catch (error) {
      logger.error('Error generating M-Pesa access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with M-Pesa API');
    }
  }

  /**
   * Generate password for STK Push
   */
  generatePassword(timestamp) {
    const password = Buffer.from(
      `${this.shortCode}${this.passkey}${timestamp}`
    ).toString('base64');
    return password;
  }

  /**
   * Format phone number to M-Pesa format (254XXXXXXXXX)
   */
  formatPhoneNumber(phone) {
    // Remove any spaces, dashes, or plus signs
    let cleaned = phone.replace(/[\s\-+]/g, '');
    
    // If starts with 0, replace with 254
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    }
    
    // If starts with 7 or 1, add 254
    if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      cleaned = '254' + cleaned;
    }
    
    // If doesn't start with 254, assume it's already formatted or invalid
    if (!cleaned.startsWith('254')) {
      throw new Error('Invalid phone number format. Must be Kenyan number (07XX or 01XX)');
    }
    
    return cleaned;
  }

  /**
   * Initiate STK Push (Lipa Na M-Pesa Online)
   * @param {Object} params - Payment parameters
   * @param {string} params.phoneNumber - Customer phone number
   * @param {number} params.amount - Amount to charge
   * @param {string} params.accountReference - Account reference (e.g., Patient ID)
   * @param {string} params.transactionDesc - Transaction description
   * @returns {Object} STK Push response
   */
  async stkPush({ phoneNumber, amount, accountReference, transactionDesc }) {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const password = this.generatePassword(timestamp);
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const payload = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline', // For paybill, use 'CustomerBuyGoodsOnline' for till
        Amount: Math.round(amount), // M-Pesa accepts integers only
        PartyA: formattedPhone, // Customer phone number
        PartyB: this.shortCode, // Organization shortcode
        PhoneNumber: formattedPhone,
        CallBackURL: this.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc
      };

      logger.info('Initiating STK Push', {
        phone: formattedPhone,
        amount: payload.Amount,
        reference: accountReference
      });

      const response = await axios.post(this.stkPushUrl, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info('STK Push initiated successfully', {
        checkoutRequestId: response.data.CheckoutRequestID,
        responseCode: response.data.ResponseCode
      });

      return {
        success: response.data.ResponseCode === '0',
        message: response.data.CustomerMessage || response.data.ResponseDescription,
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID,
        responseCode: response.data.ResponseCode
      };
    } catch (error) {
      logger.error('Error initiating STK Push:', error.response?.data || error.message);
      
      if (error.response?.data) {
        return {
          success: false,
          message: error.response.data.errorMessage || 'Failed to initiate payment',
          errorCode: error.response.data.errorCode
        };
      }
      
      throw new Error('Failed to initiate M-Pesa payment');
    }
  }

  /**
   * Query STK Push transaction status
   * @param {string} checkoutRequestId - Checkout Request ID from STK Push
   */
  async queryTransaction(checkoutRequestId) {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const password = this.generatePassword(timestamp);

      const payload = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      logger.info('Querying STK Push status', { checkoutRequestId });

      const response = await axios.post(this.queryUrl, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const resultCode = response.data.ResultCode;
      
      return {
        success: resultCode === '0',
        resultCode: resultCode,
        resultDesc: response.data.ResultDesc,
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID
      };
    } catch (error) {
      logger.error('Error querying STK Push status:', error.response?.data || error.message);
      throw new Error('Failed to query payment status');
    }
  }

  /**
   * Parse M-Pesa callback data
   * @param {Object} callbackData - Callback data from M-Pesa
   */
  parseCallback(callbackData) {
    try {
      const body = callbackData.Body?.stkCallback;
      
      if (!body) {
        throw new Error('Invalid callback format');
      }

      const result = {
        merchantRequestId: body.MerchantRequestID,
        checkoutRequestId: body.CheckoutRequestID,
        resultCode: body.ResultCode,
        resultDesc: body.ResultDesc,
        success: body.ResultCode === 0
      };

      // If successful, extract callback metadata
      if (result.success && body.CallbackMetadata?.Item) {
        const items = body.CallbackMetadata.Item;
        
        items.forEach(item => {
          switch (item.Name) {
            case 'Amount':
              result.amount = item.Value;
              break;
            case 'MpesaReceiptNumber':
              result.receiptNumber = item.Value;
              break;
            case 'TransactionDate':
              result.transactionDate = this.parseTransactionDate(item.Value);
              break;
            case 'PhoneNumber':
              result.phoneNumber = item.Value;
              break;
          }
        });
      }

      logger.info('Callback parsed successfully', {
        checkoutRequestId: result.checkoutRequestId,
        success: result.success,
        receiptNumber: result.receiptNumber
      });

      return result;
    } catch (error) {
      logger.error('Error parsing M-Pesa callback:', error);
      throw new Error('Failed to parse callback data');
    }
  }

  /**
   * Parse M-Pesa transaction date format (YYYYMMDDHHmmss) to ISO format
   */
  parseTransactionDate(dateString) {
    if (!dateString || dateString.length !== 14) {
      return null;
    }
    
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    const hour = dateString.substring(8, 10);
    const minute = dateString.substring(10, 12);
    const second = dateString.substring(12, 14);
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`).toISOString();
  }

  /**
   * Validate M-Pesa configuration
   */
  validateConfig() {
    const required = [
      'consumerKey',
      'consumerSecret',
      'passkey',
      'shortCode',
      'callbackUrl'
    ];

    const missing = required.filter(field => !this[field]);

    if (missing.length > 0) {
      throw new Error(`Missing M-Pesa configuration: ${missing.join(', ')}`);
    }

    return true;
  }
}

// Export singleton instance
module.exports = new MpesaService();

