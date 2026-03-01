const admin = require('../config/firebase');

const db = admin.firestore();

const sendMessage = async (req, res) => {
    try {
        // 1️⃣ Auth Check
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) return res.status(401).json({ error: 'Authentication required' });

        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (e) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const uid = decodedToken.uid;

        // 2️⃣ Input Validation
        const { senderId, receiverId, senderName, receiverName, text, iv, salt, options = {} } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Message text cannot be empty' });
        }

        if (!senderId || !receiverId) {
            return res.status(400).json({ error: 'senderId and receiverId are required' });
        }

        if (senderId !== uid) {
            return res.status(403).json({ error: 'Not authorized to send as this user' });
        }

        // 3️⃣ Check if chat exists and create/update accordingly
        const chatsRef = db.collection('chats');

        // Check sender -> receiver
        const q1 = chatsRef.where('senderId', '==', senderId).where('receiverId', '==', receiverId);
        // Check receiver -> sender
        const q2 = chatsRef.where('senderId', '==', receiverId).where('receiverId', '==', senderId);

        const [s1, s2] = await Promise.all([q1.get(), q2.get()]);

        let chatDocRef;
        let chatId;

        if (!s1.empty) {
            chatDocRef = s1.docs[0].ref;
            chatId = s1.docs[0].id;
        } else if (!s2.empty) {
            chatDocRef = s2.docs[0].ref;
            chatId = s2.docs[0].id;
        }

        const timestamp = admin.firestore.FieldValue.serverTimestamp();

        if (!chatDocRef) {
            // Step 4: If no chat, block sending unless explicitly allowed (e.g. psychiatrist initiated)
            if (!options.allowCreate) {
                return res.status(403).json({ error: 'Chat not available. Please wait until your request is accepted.' });
            }

            const newChatRef = await chatsRef.add({
                senderId,
                receiverId,
                senderName: senderName || 'Unknown',
                receiverName: receiverName || 'Unknown',
                lastMessage: '🔒 Encrypted Message...',
                lastMessageAt: timestamp,
                createdAt: timestamp
            });
            chatDocRef = newChatRef;
            chatId = newChatRef.id;
        } else {
            // update chat with last message
            await chatDocRef.update({
                lastMessage: '🔒 Encrypted Message...',
                lastMessageAt: timestamp
            });
        }

        // 5️⃣ Add message to messages subcollection
        const messageRef = await chatDocRef.collection('messages').add({
            senderId,
            receiverId,
            text: text.trim(), // The encrypted payload
            iv: iv || null,
            salt: salt || null,
            timestamp
        });

        res.status(200).json({ success: true, messageId: messageRef.id, chatId });

    } catch (err) {
        console.error('Send message error:', err.message);
        res.status(500).json({ error: 'Internal system error', details: err.message });
    }
};

module.exports = { sendMessage };
