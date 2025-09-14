/*
  Usage:
  1) Ensure env for Firebase Admin is set (same as your backend .env)
  2) Install deps once: npm i bcrypt
  3) Run: node scripts/seedPsychiatrists.js

  Customize the accounts array below to your 10 psychiatrists.
*/

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const admin = require('../config/firebase');

const db = admin.firestore();

// EDIT THIS LIST (NSUT)
const accounts = [
  { name: 'Dr. A', email: 'psy1@nsut.edu', password: 'StrongPass1!', specialization: 'Anxiety', college: 'NSUT' },
  { name: 'Dr. B', email: 'psy2@nsut.edu', password: 'StrongPass2!', specialization: 'Depression', college: 'NSUT' },
  { name: 'Dr. C', email: 'psy3@nsut.edu', password: 'StrongPass3!', specialization: 'Stress', college: 'NSUT' },
  { name: 'Dr. D', email: 'psy4@nsut.edu', password: 'StrongPass4!', specialization: 'Sleep', college: 'NSUT' },
  { name: 'Dr. E', email: 'psy5@nsut.edu', password: 'StrongPass5!', specialization: 'Addiction', college: 'NSUT' },
  { name: 'Dr. F', email: 'psy6@nsut.edu', password: 'StrongPass6!', specialization: 'Trauma', college: 'NSUT' },
  { name: 'Dr. G', email: 'psy7@nsut.edu', password: 'StrongPass7!', specialization: 'Mood Disorders', college: 'NSUT' },
  { name: 'Dr. H', email: 'psy8@nsut.edu', password: 'StrongPass8!', specialization: 'Adolescents', college: 'NSUT' },
  { name: 'Dr. I', email: 'psy9@nsut.edu', password: 'StrongPass9!', specialization: 'Relationships', college: 'NSUT' },
  { name: 'Dr. J', email: 'psy10@nsut.edu', password: 'StrongPass10!', specialization: 'General', college: 'NSUT' },
];

async function seed() {
  console.log('Seeding psychiatrists...');
  for (const acc of accounts) {
    const emailKey = acc.email.toLowerCase();
    const docRef = db.collection('psychiatrists').doc(emailKey);
    const passwordHash = await bcrypt.hash(acc.password, 10);

    const payload = {
      email: emailKey,
      name: acc.name || null,
      specialization: acc.specialization || null,
      role: 'psychiatrist',
      college: acc.college || 'NSUT',
      passwordHash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const existing = await docRef.get();
    if (existing.exists) {
      await docRef.set(payload, { merge: true });
      console.log(`Updated: ${emailKey}`);
    } else {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await docRef.set(payload);
      console.log(`Created: ${emailKey}`);
    }
  }
  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});


