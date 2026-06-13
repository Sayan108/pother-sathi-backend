# Admin Panel API Guide

This document describes the admin-facing backend APIs and how to use them in the admin frontend.

## Base URL

Use the backend HTTP URL for all admin REST calls:

```ts
const API_BASE_URL = "http://localhost:5000";
```

## Authentication Flow for Admin Frontend

### 1. Admin login

**Endpoint**

- `POST /api/auth/admin/login`

**Headers**

- `Content-Type: application/json`

**Body**

```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "password": "strong-password"
}
```

**Success response**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "role": "admin",
    "user": {
      "id": "...",
      "phone": "9876543210",
      "countryCode": "+91",
      "name": "Admin",
      "email": null,
      "role": "admin"
    }
  }
}
```

**Frontend behavior**

- Store `accessToken` and `refreshToken` securely.
- Use `accessToken` in the `Authorization` header for subsequent admin requests.
- Use `refreshToken` with `/api/auth/refresh` when the access token expires.

### 2. Admin registration

**Endpoint**

- `POST /api/auth/admin/register`

**Headers**

- `Content-Type: application/json`

**Body**

```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "password": "strong-password",
  "name": "Admin",
  "adminSecret": "<optional-admin-creation-key>"
}
```

**Notes**

- If the backend sets `ADMIN_CREATION_KEY` in `.env`, `adminSecret` must match it.
- If the key is not set, admin registration is restricted after a few accounts exist.

**Success response**

```json
{
  "success": true,
  "message": "Admin account created successfully",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "role": "admin",
    "user": {
      "id": "...",
      "phone": "9876543210",
      "countryCode": "+91",
      "name": "Admin",
      "email": null,
      "role": "admin"
    }
  }
}
```

### 3. Refresh token

**Endpoint**

- `POST /api/auth/refresh`

**Headers**

- `Content-Type: application/json`

**Body**

```json
{
  "refreshToken": "<refresh-token>"
}
```

**Success response**

```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "accessToken": "..."
  }
}
```

### 4. Logout

**Endpoint**

- `POST /api/auth/logout`

**Headers**

- `Content-Type: application/json`
- `Authorization: Bearer <accessToken>`

**Body**

```json
{}
```

**Success response**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## Admin-protected APIs

All admin routes under `/api/admin` require:

- `Authorization: Bearer <accessToken>`
- admin role access

### 1. Fetch pending drivers

**Endpoint**

- `GET /api/admin/drivers/pending`

**Query parameters**

- `page` (optional, default `1`)
- `limit` (optional, default `20`, max `100`)

**Response**

```json
{
  "success": true,
  "message": "Pending driver approvals fetched",
  "data": {
    "drivers": [
      {
        "_id": "...",
        "phone": "9876543210",
        "countryCode": "+91",
        "name": "Driver Name",
        "vehicleType": "bike",
        "vehicleModel": "Honda Shine",
        "vehicleNumber": "WB12AB1234",
        "accountStatus": "pending",
        "walletBalance": 0,
        "aadhaarNumber": "123456789012",
        "licenseNumber": "WB0120230001234",
        "aadhaarDocument": "https://...",
        "licenseDocument": "https://...",
        "selfieDocument": "https://...",
        "vehicleDocument": "https://...",
        "createdAt": "..."
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Frontend usage**

- Build an approvals table showing each driver’s profile, KYC documents, and current status.
- Use the pagination metadata to support paging in the admin UI.

### 2. Approve driver

**Endpoint**

- `PATCH /api/admin/drivers/:id/verify`

**Headers**

- `Authorization: Bearer <accessToken>`

**Body**

```json
{}
```

**Success response**

```json
{
  "success": true,
  "message": "Driver approved and ₹3000 bonus credited",
  "data": {
    "driverId": "...",
    "walletBalance": 3000,
    "accountStatus": "verified"
  }
}
```

**Frontend behavior**

- After approval, update the driver row status to `verified`.
- Show a success notification with the credited bonus amount.

### 3. Reject driver

**Endpoint**

- `PATCH /api/admin/drivers/:id/reject`

**Headers**

- `Authorization: Bearer <accessToken>`

**Body**

```json
{}
```

**Success response**

```json
{
  "success": true,
  "message": "Driver verification rejected",
  "data": {
    "driverId": "...",
    "accountStatus": "rejected"
  }
}
```

**Frontend behavior**

- Mark the request as rejected and remove it from pending approvals if desired.
- Optionally show an alert explaining rejection status.

### 4. Adjust driver wallet

**Endpoint**

- `PATCH /api/admin/drivers/:id/wallet`

**Headers**

- `Content-Type: application/json`
- `Authorization: Bearer <accessToken>`

**Body**

```json
{
  "action": "credit", // credit | debit | set
  "amount": 500,
  "description": "Manual wallet correction"
}
```

**Rules**

- `action` must be one of: `credit`, `debit`, `set`
- `amount` must be a non-negative number
- `description` is optional
- `debit` will remove up to the current wallet balance, never going negative

**Success response**

```json
{
  "success": true,
  "message": "Driver wallet updated",
  "data": {
    "driverId": "...",
    "walletBalance": 1500
  }
}
```

**Frontend behavior**

- Use this API in a wallet adjustment modal or admin finance screen.
- Validate the amount and action in the UI before submitting.
- Show the updated balance after success.

### 5. Fetch driver recharge requests

**Endpoint**

- `GET /api/admin/driver/wallet/recharge-requests`

**Query parameters**

- `status` (optional, defaults to `pending`)
- `page` (optional, default `1`)
- `limit` (optional, default `20`, max `100`)

**Response**

```json
{
  "success": true,
  "message": "Recharge requests fetched",
  "data": {
    "requests": [
      {
        "_id": "...",
        "driverId": {
          "phone": "9876543210",
          "name": "Driver Name",
          "accountStatus": "verified"
        },
        "amount": 1000,
        "paymentReference": "TXN123456",
        "status": "pending",
        "createdAt": "..."
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Frontend usage**

- Display requests with driver details, amount, and payment reference.
- Support filtering by `status`.

### 6. Approve recharge request

**Endpoint**

- `PATCH /api/admin/driver/wallet/recharge-requests/:id/approve`

**Headers**

- `Authorization: Bearer <accessToken>`

**Body**

```json
{}
```

**Success response**

```json
{
  "success": true,
  "message": "Recharge request approved",
  "data": {
    "requestId": "...",
    "walletBalance": 2500
  }
}
```

**Frontend behavior**

- Move the request from pending to approved state.
- Show updated wallet balance and confirmation.

### 7. Reject recharge request

**Endpoint**

- `PATCH /api/admin/driver/wallet/recharge-requests/:id/reject`

**Headers**

- `Authorization: Bearer <accessToken>`

**Body**

```json
{}
```

**Success response**

```json
{
  "success": true,
  "message": "Recharge request rejected",
  "data": {
    "requestId": "...",
    "status": "rejected"
  }
}
```

**Frontend behavior**

- Mark the request as rejected and show the result to the admin.

---

## Recommended admin panel UI flows

### Login and auth management

- Use `/api/auth/admin/login` for admin authentication.
- Store `accessToken` and `refreshToken` securely.
- Refresh the access token automatically with `/api/auth/refresh` before API expiry.
- Use `Authorization: Bearer <accessToken>` for all `/api/admin` requests.
- Offer a logout action that calls `/api/auth/logout`.

### Driver approval workflow

- Load pending drivers from `GET /api/admin/drivers/pending`.
- Show driver KYC details and documents clearly.
- Provide approve/reject actions for each row.
- After approval, refresh the pending list and update the driver status.

### Wallet and recharge workflows

- Create a recharge request dashboard for admins.
- Allow status filters: `pending`, `approved`, `rejected`.
- Offer approve/reject buttons for pending requests.
- Provide a wallet adjustment form on the driver detail page.

### Error handling

- Show backend `message` from failed responses.
- Handle 401/403 by redirecting to login or showing permission errors.
- Validate amount and action choices in the UI before sending wallet updates.

## Notes for frontend developers

- All admin routes require an admin access token from login.
- The backend response shape is generally:

```json
{
  "success": boolean,
  "message": string,
  "data": object,
  "meta": object
}
```

- Use response `message` to inform admin users.
- Keep token storage secure and do not expose refresh tokens in plain UI.
- If the environment uses `ADMIN_CREATION_KEY`, the frontend should provide a way to enter it when creating the first admin.
