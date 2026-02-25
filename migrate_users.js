const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
    console.error("Missing Firebase credentials in .env. Please ensure FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL are set.");
    process.exit(1);
}

// Initialize Firebase Admin with credentials
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Subcollections that should be migrated under users/{uid}/...
const USER_SUBCOLLECTIONS = [
    'planner',
    'journal',
    'dailyMood',
    'moodAssessment',
    'preferences',
    'dailyAssessment',
    'moodReports',
    'reports',
    'assessmentResults'
];

async function migrateSubcollections(oldDocRef, newDocRef) {
    for (const subCollName of USER_SUBCOLLECTIONS) {
        const subCollRef = oldDocRef.collection(subCollName);
        const subCollSnap = await subCollRef.get();

        if (!subCollSnap.empty) {
            console.log(`    >> Migrating subcollection: ${subCollName} (${subCollSnap.size} docs)`);
            for (const subDoc of subCollSnap.docs) {
                const newSubDocRef = newDocRef.collection(subCollName).doc(subDoc.id);
                await newSubSubDocsRecursive(subDoc.ref, newSubDocRef);
                await newSubDocRef.set(subDoc.data(), { merge: true });
            }
        }
    }
}

// Simple recursive helper for deeper subcollections if found (e.g. preferences/bookmarks)
async function newSubSubDocsRecursive(oldRef, newRef) {
    // Only checking 'assessments' for moodAssessment as seen in code
    const specialSub = ['assessments'];
    for (const name of specialSub) {
        const snap = await oldRef.collection(name).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await newRef.collection(name).doc(d.id).set(d.data(), { merge: true });
            }
        }
    }
}

async function migrate() {
    console.log("🚀 Starting COMPREHENSIVE data migration to 'users' collection...");

    const sourceCollections = ['students', 'psychiatrists', 'admins'];

    for (const collName of sourceCollections) {
        console.log(`\n📂 Checking legacy collection: ${collName}...`);
        try {
            const snapshot = await db.collection(collName).get();

            if (snapshot.empty) {
                console.log(`ℹ️  Collection '${collName}' is empty or does not exist.`);
                continue;
            }

            for (const doc of snapshot.docs) {
                const data = doc.data();
                const targetId = data.uid || data.email || doc.id;

                if (!targetId) continue;

                const userRef = db.collection('users').doc(targetId);

                let role = data.role;
                if (!role) {
                    if (collName === 'students') role = 'student';
                    else if (collName === 'psychiatrists') role = 'psychiatrist';
                    else if (collName === 'admins') role = 'admin';
                }

                await userRef.set({
                    ...data,
                    role: role || 'user',
                    migratedFrom: collName,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                await migrateSubcollections(doc.ref, userRef);
                console.log(`  ✅ Migrated: ${targetId} (from ${collName})`);
            }
        } catch (err) {
            console.error(`❌ Error migrating collection ${collName}:`, err.message);
        }
    }

    console.log("\n💬 Auditing 'chats' collection for email-based participants...");
    const chatsSnap = await db.collection('chats').get();
    for (const chatDoc of chatsSnap.docs) {
        const chatData = chatDoc.data();
        let updated = false;
        const newChatData = { ...chatData };

        const findUid = async (id) => {
            if (!id || !id.includes('@')) return null;
            const q = await db.collection('users').where('email', '==', id).limit(1).get();
            return q.empty ? null : q.docs[0].id;
        };

        if (chatData.senderId && chatData.senderId.includes('@')) {
            const uid = await findUid(chatData.senderId);
            if (uid) { newChatData.senderId = uid; updated = true; }
        }
        if (chatData.receiverId && chatData.receiverId.includes('@')) {
            const uid = await findUid(chatData.receiverId);
            if (uid) { newChatData.receiverId = uid; updated = true; }
        }

        if (updated) {
            console.log(`  🔄 Updating chat ${chatDoc.id}: ${chatData.senderId} -> ${newChatData.senderId}`);
            await chatDoc.ref.update(newChatData);
        }
    }

    console.log("\n🤖 Migrating 'chatbot' sessions from email keys to UID keys...");
    const chatbotSnap = await db.collection('chatbot').get();
    for (const userDoc of chatbotSnap.docs) {
        const email = userDoc.id; // Legacy key is email
        if (!email.includes('@')) continue;

        // Find UID for this email
        const userQ = await db.collection('users').where('email', '==', email).limit(1).get();
        if (userQ.empty) {
            console.warn(`  ⚠️  No UID found for chatbot email: ${email}. Skipping.`);
            continue;
        }
        const uid = userQ.docs[0].id;
        const newUserDocRef = db.collection('chatbot').doc(uid);

        // Migrate all 'sessions' subcollection
        const sessionsSnap = await userDoc.ref.collection('sessions').get();
        if (!sessionsSnap.empty) {
            console.log(`  >> Migrating ${sessionsSnap.size} chatbot sessions for ${email} -> ${uid}`);
            for (const sessionDoc of sessionsSnap.docs) {
                await newUserDocRef.collection('sessions').doc(sessionDoc.id).set(sessionDoc.data(), { merge: true });
            }
        }
    }

    console.log("\n✨ Comprehensive Migration complete!");
}

migrate().catch(err => {
    console.error("💥 Fatal migration error:", err);
    process.exit(1);
});
