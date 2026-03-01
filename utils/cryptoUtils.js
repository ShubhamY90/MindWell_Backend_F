const crypto = require('crypto');

// AES-256-GCM configurations
const ALGORITHM = 'aes-256-gcm';
const ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits
const DIGEST = 'sha256';

/**
 * Derives a consistent AES key using PBKDF2 from a password and salt
 */
const getKeyFromPassword = (password, saltBuffer) => {
    return crypto.pbkdf2Sync(password, saltBuffer, ITERATIONS, KEY_LEN, DIGEST);
};

/**
 * Encrypt text using AES-256-GCM
 * @param {string} text Plaintext to encrypt
 * @param {string} password The shared secret or user UID
 * @returns {Object} { data: base64, iv: base64, salt: base64, authTag: base64 }
 */
const encryptText = (text, password) => {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);

    const key = getKeyFromPassword(password, salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    return {
        data: encrypted,
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        authTag // Requisite for GCM decryption in Node.js
    };
};

/**
 * Decrypt text using AES-256-GCM
 * @param {Object} payload { data, iv, salt, authTag }
 * @param {string} password The shared secret or user UID
 * @returns {string} Decrypted plaintext
 */
const decryptText = (payload, password) => {
    if (!payload.data || !payload.iv || !payload.salt || !payload.authTag) {
        throw new Error('Missing encryption components in payload');
    }

    const saltBuffer = Buffer.from(payload.salt, 'base64');
    const ivBuffer = Buffer.from(payload.iv, 'base64');
    const authTagBuffer = Buffer.from(payload.authTag, 'base64');

    const key = getKeyFromPassword(password, saltBuffer);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    let decrypted = decipher.update(payload.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
};

module.exports = {
    encryptText,
    decryptText
};
