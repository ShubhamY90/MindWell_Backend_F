const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const getApiKeys = () => {
    const keysFromEnv = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()) : [];
    const primaryKey = process.env.GEMINI_API_KEY?.trim();

    let allKeys = [...keysFromEnv];
    if (primaryKey && !allKeys.includes(primaryKey)) {
        allKeys.unshift(primaryKey);
    }
    return allKeys.filter(k => k);
};

const apiKeys = getApiKeys();
console.log(`Found ${apiKeys.length} API keys.`);

async function testRotation() {
    for (let i = 0; i < apiKeys.length; i++) {
        console.log(`\n--- Testing Key #${i + 1} ---`);
        const genAI = new GoogleGenerativeAI(apiKeys[i]);
        try {
            // Updated to 1.5-flash as per core logic
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                systemInstruction: 'You are a helpful assistant.'
            });
            const result = await model.generateContent('Hello');
            console.log(`✅ Key #${i + 1} Success!`);
        } catch (err) {
            console.error(`❌ Key #${i + 1} Failed:`, err.message);
            if (err.message.includes('429')) {
                console.warn('-> Quota exceeded for this key.');
            } else if (err.message.includes('401') || err.message.includes('403')) {
                console.warn('-> Invalid API Key.');
            }
        }
    }
}

testRotation();
