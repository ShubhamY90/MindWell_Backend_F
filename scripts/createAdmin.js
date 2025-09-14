const admin = require('../config/firebase');
const bcrypt = require('bcrypt');

const db = admin.firestore();

const createAdmin = async () => {
  try {
    const adminEmail = 'admin@mindwell.com';
    const adminPassword = 'admin123'; // Change this to a secure password
    const adminName = 'System Administrator';

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    // Create admin user in Firestore
    const adminRef = db.collection('users').doc(adminEmail);
    
    // Check if admin already exists
    const adminDoc = await adminRef.get();
    if (adminDoc.exists) {
      console.log('Admin user already exists');
      return;
    }

    await adminRef.set({
      email: adminEmail,
      name: adminName,
      role: 'admin',
      passwordHash: passwordHash,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Admin user created successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('Role: admin');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
};

// Run the script
createAdmin().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
