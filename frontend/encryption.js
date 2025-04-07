// Encryption utility functions
class Encryption {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.ivLength = 12;
        this.tagLength = 128;
        this.key = null;
        this.isSupported = false;
        this.initialize();
    }

    async initialize() {
        try {
            // Check if Web Crypto API is available
            if (!window.crypto || !window.crypto.subtle) {
                console.warn('Web Crypto API not available. Encryption will be disabled.');
                this.isSupported = false;
                return;
            }

            // Test if we can generate a key
            await this.generateKey();
            this.isSupported = true;
            console.log('Encryption is supported and initialized');
        } catch (error) {
            console.warn('Encryption initialization failed:', error);
            this.isSupported = false;
        }
    }

    // Generate a new key for encryption
    async generateKey() {
        if (!this.isSupported) return null;

        try {
            // Generate a random key
            this.key = await window.crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: this.keyLength
                },
                true, // extractable
                ['encrypt', 'decrypt']
            );
            
            // Export the key for sharing
            const exportedKey = await window.crypto.subtle.exportKey(
                'raw',
                this.key
            );
            
            // Convert to base64
            return this.arrayBufferToBase64(exportedKey);
        } catch (error) {
            console.error('Error generating key:', error);
            this.isSupported = false;
            return null;
        }
    }

    // Import a key for encryption/decryption
    async importKey(base64Key) {
        if (!this.isSupported) return false;

        try {
            // Convert base64 to ArrayBuffer
            const binaryKey = this.base64ToArrayBuffer(base64Key);
            
            // Import the key
            this.key = await window.crypto.subtle.importKey(
                'raw',
                binaryKey,
                {
                    name: 'AES-GCM',
                    length: this.keyLength
                },
                true,
                ['encrypt', 'decrypt']
            );
            return true;
        } catch (error) {
            console.error('Error importing key:', error);
            this.isSupported = false;
            return false;
        }
    }

    // Encrypt a message
    async encrypt(message) {
        try {
            if (!this.key) {
                throw new Error('No encryption key available');
            }
            
            // Generate IV
            const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength));
            
            // Encrypt message
            const encodedMessage = new TextEncoder().encode(message);
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.key,
                encodedMessage
            );

            // Combine IV and encrypted data
            const encryptedArray = new Uint8Array(encryptedData);
            const combined = new Uint8Array(iv.length + encryptedArray.length);
            combined.set(iv);
            combined.set(encryptedArray, iv.length);

            // Convert to base64
            return this.arrayBufferToBase64(combined);
        } catch (error) {
            console.error('Error encrypting message:', error);
            throw error;
        }
    }

    // Decrypt a message
    async decrypt(encryptedMessage) {
        try {
            if (!this.key) {
                throw new Error('No encryption key available');
            }
            
            // Convert base64 to ArrayBuffer
            const combined = this.base64ToArrayBuffer(encryptedMessage);
            
            // Extract IV and encrypted data
            const iv = combined.slice(0, this.ivLength);
            const encryptedData = combined.slice(this.ivLength);
            
            // Decrypt the message
            const decryptedData = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.key,
                encryptedData
            );
            
            // Convert ArrayBuffer to string
            return new TextDecoder().decode(decryptedData);
        } catch (error) {
            console.error('Error decrypting message:', error);
            throw error;
        }
    }

    // Utility function to convert ArrayBuffer to base64
    arrayBufferToBase64(buffer) {
        const binary = String.fromCharCode(...new Uint8Array(buffer));
        return window.btoa(binary);
    }

    // Utility function to convert base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
        try {
            // Add padding if needed
            const paddedBase64 = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
            const binary = window.atob(paddedBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (error) {
            console.error('Error converting base64 to ArrayBuffer:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const encryption = new Encryption();
export default encryption; 