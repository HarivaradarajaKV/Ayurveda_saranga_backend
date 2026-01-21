const axios = require('axios');

class ShiprocketService {
    constructor() {
        this.baseURL = process.env.SHIPROCKET_API_URL || 'https://apiv2.shiprocket.in/v1/external';
        this.token = null;
        this.tokenExpiry = null;
    }

    // Authenticate and get token
    async authenticate() {
        try {
            const response = await axios.post(`${this.baseURL}/auth/login`, {
                email: process.env.SHIPROCKET_EMAIL,
                password: process.env.SHIPROCKET_PASSWORD
            });

            this.token = response.data.token;
            // Token valid for 10 days
            this.tokenExpiry = Date.now() + (10 * 24 * 60 * 60 * 1000);

            console.log('Shiprocket authentication successful');
            return this.token;
        } catch (error) {
            console.error('Shiprocket authentication failed:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Shiprocket');
        }
    }

    // Get valid token (refresh if expired)
    async getToken() {
        if (!this.token || Date.now() >= this.tokenExpiry) {
            await this.authenticate();
        }
        return this.token;
    }

    // Create order in Shiprocket
    async createOrder(orderData) {
        try {
            const token = await this.getToken();

            const response = await axios.post(
                `${this.baseURL}/orders/create/adhoc`,
                orderData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Shiprocket order creation failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Generate AWB (Airway Bill) for shipment
    async generateAWB(shipmentId, courierId) {
        try {
            const token = await this.getToken();

            const response = await axios.post(
                `${this.baseURL}/courier/assign/awb`,
                {
                    shipment_id: shipmentId,
                    courier_id: courierId
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('AWB generation failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get recommended courier for shipment
    async getRecommendedCourier(shipmentId) {
        try {
            const token = await this.getToken();

            const response = await axios.get(
                `${this.baseURL}/courier/serviceability`,
                {
                    params: { shipment_id: shipmentId },
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Failed to get courier recommendations:', error.response?.data || error.message);
            throw error;
        }
    }

    // Track shipment
    async trackShipment(shipmentId) {
        try {
            const token = await this.getToken();

            const response = await axios.get(
                `${this.baseURL}/courier/track/shipment/${shipmentId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Shipment tracking failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Track by AWB number
    async trackByAWB(awbNumber) {
        try {
            const token = await this.getToken();

            const response = await axios.get(
                `${this.baseURL}/courier/track/awb/${awbNumber}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('AWB tracking failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Request shipment pickup
    async requestPickup(shipmentIds) {
        try {
            const token = await this.getToken();

            const response = await axios.post(
                `${this.baseURL}/courier/generate/pickup`,
                { shipment_id: shipmentIds },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Pickup request failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Cancel shipment
    async cancelShipment(awbNumbers) {
        try {
            const token = await this.getToken();

            const response = await axios.post(
                `${this.baseURL}/orders/cancel/shipment/awbs`,
                { awbs: awbNumbers },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Shipment cancellation failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Generate shipping label
    async generateLabel(shipmentIds) {
        try {
            const token = await this.getToken();

            const response = await axios.post(
                `${this.baseURL}/courier/generate/label`,
                { shipment_id: shipmentIds },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Label generation failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Generate manifest
    async generateManifest(shipmentIds) {
        try {
            const token = await this.getToken();

            const response = await axios.post(
                `${this.baseURL}/manifests/generate`,
                { shipment_id: shipmentIds },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Manifest generation failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Check serviceability (can ship to pincode?)
    async checkServiceability(pickupPincode, deliveryPincode, weight, codAmount = 0) {
        try {
            const token = await this.getToken();

            const response = await axios.get(
                `${this.baseURL}/courier/serviceability`,
                {
                    params: {
                        pickup_postcode: pickupPincode,
                        delivery_postcode: deliveryPincode,
                        weight: weight,
                        cod: codAmount > 0 ? 1 : 0
                    },
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Serviceability check failed:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new ShiprocketService();
