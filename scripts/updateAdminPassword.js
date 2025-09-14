const admin = require('../config/firebase');
const bcrypt = require('bcrypt');

const db = admin.firestore();

const updateAdminPassword = async () => {
  try {
    const adminEmail = 'admin@mindwell.com';
    const newPassword = 'MindWell2024!Secure'; // More secure password
    
    // Hash the new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update admin user password in Firestore
    const adminRef = db.collection('users').doc(adminEmail);
    
    // Check if admin exists
    const adminDoc = await adminRef.get();
    if (!adminDoc.exists) {
      console.log('Admin user does not exist');
      return;
    }

    await adminRef.update({
      passwordHash: passwordHash,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Admin password updated successfully!');
    console.log('Email:', adminEmail);
    console.log('New Password:', newPassword);
    console.log('This is a secure password that should not trigger security warnings.');
    
  } catch (error) {
    console.error('Error updating admin password:', error);
  }
};

// Run the script
updateAdminPassword().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
