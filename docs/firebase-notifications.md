# Firebase notifications setup

This backend uses Firebase Cloud Messaging through the Firebase Admin SDK.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com/>.
2. Create a project, or use an existing project.
3. Add your Android/iOS app in Project settings.
4. Download the mobile client config:
   - Android: `google-services.json`
   - iOS: `GoogleService-Info.plist`
5. In the Firebase console, make sure Cloud Messaging is enabled for the project.

## 2. Create backend credentials

For a normal VPS/server deployment:

1. Open Firebase console -> Project settings -> Service accounts.
2. Click "Generate new private key".
3. Copy the downloaded JSON into a single-line environment value.
4. Set:

```env
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_USE_ADC=false
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

For Google Cloud hosting with Application Default Credentials:

```env
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_USE_ADC=true
FIREBASE_SERVICE_ACCOUNT_JSON=
```

## 3. Register device tokens from the app

After login, the mobile app should request notification permission, get the FCM registration token, and send it to the backend.

Rider:

```http
PUT /api/rider/fcm-token
Authorization: Bearer <rider_jwt>
Content-Type: application/json

{ "fcmToken": "<device_fcm_token>" }
```

Driver:

```http
PUT /api/driver/fcm-token
Authorization: Bearer <driver_jwt>
Content-Type: application/json

{ "fcmToken": "<device_fcm_token>" }
```

The backend stores the latest token plus previous tokens for multi-device support. Invalid tokens are removed automatically when Firebase reports them as invalid.

## 4. What is sent through FCM

- Admin notifications from `POST /api/admin/notifications`.
- Ride lifecycle fallback notifications when the target user is not connected over Socket.IO:
  - driver assigned
  - driver arrived
  - ride started
  - ride completed
  - ride cancelled

Socket.IO remains the realtime path for foreground users; FCM is the offline/background fallback.
