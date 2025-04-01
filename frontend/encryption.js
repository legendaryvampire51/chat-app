// Encryption utility functions
class Encryption {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.ivLength = 12;
        this.tagLength = 128;
        this.publicKey = null;
        this.privateKey = null;
        this.userKeys = new Map(); // Store other users' public keys
    }

    // Generate a new key pair for the user
    async generateKeyPair() {
        try {
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: 'ECDH',
                    namedCurve: 'P-256'
                },
                true, // extractable
                ['deriveKey', 'deriveBits']
            );
            
            this.privateKey = keyPair.privateKey;
            this.publicKey = keyPair.publicKey;
            
            // Export public key for sharing
            const exportedPublicKey = await window.crypto.subtle.exportKey(
                'spki',
                this.publicKey
            );
            
            // Convert to base64
            const base64PublicKey = this.arrayBufferToBase64(exportedPublicKey);
            
            return {
                publicKey: base64PublicKey,
                privateKey: this.privateKey
            };
        } catch (error) {
            console.error('Error generating key pair:', error);
            throw error;
        }
    }

    // Import another user's public key
    async importPublicKey(base64PublicKey) {
        try {
            // Convert base64 to ArrayBuffer
            const binaryPublicKey = this.base64ToArrayBuffer(base64PublicKey);
            
            // Import the key
            const publicKey = await window.crypto.subtle.importKey(
                'spki',
                binaryPublicKey,
                {
                    name: 'ECDH',
                    namedCurve: 'P-256'
                },
                true,
                ['deriveKey', 'deriveBits']
            );
            
            return publicKey;
        } catch (error) {
            console.error('Error importing public key:', error);
            throw error;
        }
    }

    // Generate a shared secret key for encryption
    async generateSharedSecret(publicKey) {
        try {
            // Import the public key with the correct algorithm
            const importedPublicKey = await window.crypto.subtle.importKey(
                'spki',
                this.base64ToArrayBuffer(publicKey),
                {
                    name: 'ECDH',
                    namedCurve: 'P-256'
                },
                true,
                ['deriveKey', 'deriveBits']
            );

            // Generate shared secret using the imported key
            const sharedSecret = await window.crypto.subtle.deriveKey(
                {
                    name: 'ECDH',
                    public: importedPublicKey
                },
                this.privateKey,
                {
                    name: 'AES-GCM',
                    length: 256
                },
                true,
                ['encrypt', 'decrypt']
            );

            return sharedSecret;
        } catch (error) {
            console.error('Error generating shared secret:', error);
            throw error;
        }
    }

    // Encrypt a message
    async encrypt(message, publicKey) {
        try {
            // Generate shared secret
            const key = await this.generateSharedSecret(publicKey);
            
            // Generate IV
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            // Encrypt message
            const encodedMessage = new TextEncoder().encode(message);
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
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
    async decrypt(encryptedMessage, senderPublicKey) {
        try {
            // Convert base64 to ArrayBuffer
            const combined = this.base64ToArrayBuffer(encryptedMessage);
            
            // Extract IV and encrypted data
            const iv = combined.slice(0, this.ivLength);
            const encryptedData = combined.slice(this.ivLength);
            
            // Generate shared secret
            const key = await this.generateSharedSecret(senderPublicKey);
            
            // Decrypt the message
            const decryptedData = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
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