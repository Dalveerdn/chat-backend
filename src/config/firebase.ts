import admin from "firebase-admin";
import serviceAccount from "../../chat-backend-a115f-firebase-adminsdk-fbsvc-6fca2fe455.json"

admin.initializeApp({
    credential: admin.credential.cert(
        serviceAccount as admin.ServiceAccount
    )
});

const firestore = admin.firestore();

export default firestore;