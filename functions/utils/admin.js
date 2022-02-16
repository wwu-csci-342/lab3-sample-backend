const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
} else {
  admin.app(); // if already initialized, use that one
}
// admin.initializeApp();
const db = admin.firestore();

module.exports = { admin, db };
