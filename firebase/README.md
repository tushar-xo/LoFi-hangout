# Firebase Configuration

## Firestore Security Rules

This directory contains the Firestore security rules for the LoFi-Hangout application. The current rules allow:

- Authenticated users to read and write to all collections
- Public access to read public rooms
- Only authenticated users can create or modify rooms

## Deploying Rules

To deploy these rules to your Firebase project, follow these steps:

1. Install the Firebase CLI if you haven't already:
   ```
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```
   firebase login
   ```

3. Initialize your project (if not already done):
   ```
   firebase init
   ```

4. Deploy the rules:
   ```
   firebase deploy --only firestore:rules
   ```

## Troubleshooting Permission Issues

If you're experiencing "Permission Denied" errors in your application:

1. Make sure users are properly authenticated before accessing Firestore
2. Check that your security rules match your application's access patterns
3. Use the Firebase Console's Rules Playground to test your rules
4. Ensure your Firebase project ID matches the one in your application