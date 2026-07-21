# Mobile App Ride Booking Guide

This document describes the ride booking flow for both riders and drivers in the current backend implementation, including online/offline handling and expected edge cases.

## 1. Core idea

Ride booking is handled in real time using Socket.IO.

- Rider app sends booking/search requests over socket events.
- Driver app receives ride offers and accepts/rejects them over socket events.
- The backend updates ride state and notifies the relevant party.

> Important: The current backend does not broadcast a ride request to every available driver at once. It selects one eligible live driver first and re-offers to the next driver if that driver rejects.

---

## 2. Rider flow

### 2.1 Rider searches for a ride

Socket event:
- `ride:search`

Payload:
- `pickup`
- `drop`
- `vehicleType`
- `couponCode`

Behavior:
- The backend calculates distance and fare.
- It looks for drivers that are:
  - active,
  - online,
  - available,
  - approved/verified,
  - and matching the requested vehicle type.
- The response contains fare breakdown and a list of available live drivers.

Expected UI:
- Show fare estimate and available driver count.
- If no drivers are available, show a retry / wait state.

### 2.2 Rider books a ride

Socket event:
- `ride:book`

Payload:
- `pickup`
- `drop`
- `vehicleType`
- `couponCode`
- `paymentMethod` (default: `cash`)

Behavior:
- The backend checks whether the rider already has an active ride.
- If the rider already has an active ride, booking is rejected.
- A ride is created with status `requested`.
- One eligible driver is selected and notified.

Expected UI:
- Show booking status: `Searching for driver...`
- Show a timeout / fallback state if the ride remains unaccepted too long.

### 2.3 Rider receives driver assignment

Events:
- `driver:assigned`
- `ride:driver_assigned`

Payload contains:
- ride id
- driver details
- estimated arrival

Expected UI:
- Switch from searching to `Driver assigned`.
- Show driver name, vehicle number, rating, and location.

### 2.4 Rider can be notified if no driver is found

Events:
- `ride:no_driver`
- `ride:driver_not_found`

Behavior:
- If all offered drivers reject or no eligible driver exists, the ride becomes `no_driver`.

Expected UI:
- Show “No driver found” and allow the rider to retry.

---

## 3. Driver flow

### 3.1 Driver joins available pool

Socket event:
- `driver:join_available`

Behavior:
- The driver must be:
  - active,
  - approved/verified,
  - online,
  - and available.

Expected UI:
- Driver should be marked online and available before entering the request pool.

### 3.2 Driver receives ride request

Events:
- `ride:request`
- `ride:assigned`

Payload contains:
- ride id
- pickup/drop
- fare
- rider info
- vehicle type
- route info

Expected UI:
- Show incoming ride request with accept/reject actions.

### 3.3 Driver accepts ride

Socket event:
- `ride:accept`

Behavior:
- The ride must still be pending and assigned to that driver.
- The driver must still be online and available.
- If accepted:
  - ride status becomes `driver_on_the_way`
  - driver becomes unavailable for new requests
  - rider receives assignment notification

Expected UI:
- Show “Ride Accepted” and navigation to pickup.

### 3.4 Driver rejects ride

Socket event:
- `driver:reject_ride`

Behavior:
- The backend records the driver as rejected for that ride.
- It then offers the ride to the next eligible driver.
- If no one accepts, the ride becomes `no_driver`.

Expected UI:
- Show “Ride rejected” and return to the available pool.

---

## 4. Online vs offline handling

### 4.1 Rider online

If the rider app is connected:
- booking/search requests work normally.
- real-time assignments and ride updates are received instantly.

### 4.2 Rider offline

If the rider app disconnects:
- the backend cannot push live events to the rider until the app reconnects.
- the ride may still continue on the server side.

Mobile app recommendation:
- On reconnect, the app should rehydrate the current ride state from the backend.
- If the app was in a pending booking state, it should show a recovery screen and re-check ride status.
- Avoid assuming the app will receive live events while offline.

### 4.3 Driver online

If the driver is online and available:
- they can receive ride requests.
- they can accept/reject rides.

### 4.4 Driver offline

If the driver disconnects:
- the backend removes them from the live driver pool.
- they will no longer receive new ride requests.
- the ride will be re-offered to another eligible driver if necessary.

Mobile app recommendation:
- On reconnect, driver app should re-enter the available state.
- If the driver was mid-ride or had an accepted ride, the backend should be queried for current ride status.

---

## 5. Ride states

The backend uses these ride states:

- `requested`
- `accepted`
- `driver_on_the_way`
- `searching`
- `driver_assigned`
- `driver_arrived`
- `otp_verified`
- `started`
- `in_progress`
- `completed`
- `cancelled`
- `no_driver`

Mobile app recommendation:
- Map these states to UI screens consistently.
- Never assume a ride is still pending just because the app has not received a new event.

---

## 6. Edge cases to handle in the mobile app

### 6.1 Multiple ride requests for one rider

If a rider tries to book another ride while an active ride exists:
- the backend rejects the new booking with:
  - `You already have an active ride`

Expected UI:
- Show a clear message and prevent duplicate booking attempts.

### 6.2 Multiple drivers available for one ride

Current behavior:
- one eligible driver is selected first.
- if that driver rejects, the ride is offered to the next eligible driver.

Expected UI:
- Do not assume all nearby drivers were notified at once.
- Handle the possibility that the ride may be re-offered.

### 6.3 Driver accepts while already busy

If a driver already has an active ride:
- they should not be able to accept another ride.

Expected UI:
- Disable accept actions when the driver is not available.

### 6.4 Driver rejects and later becomes available again

If a driver rejects a ride:
- they are not automatically assigned to the ride.
- they can receive future requests normally.

Expected UI:
- Return them to the available state after reject.

### 6.5 No driver found

If no driver accepts:
- the ride ends with `no_driver`.

Expected UI:
- Show a retry option or allow the rider to search again.

### 6.6 Rider disconnects during search/book

If the rider disconnects while the ride is pending:
- the backend may still process the ride.
- the rider may miss notifications.

Expected UI:
- On reconnect, show a recovery state and re-check the ride status.

### 6.7 Driver disconnects during request handling

If the driver disconnects:
- the backend removes them from the live pool.
- the ride is re-offered to another driver.

Expected UI:
- Show a fallback state and avoid assuming the current driver still has the request.

### 6.8 Duplicate tap / double booking

Mobile app should prevent duplicate booking requests caused by repeated taps.

Expected UI:
- Disable the book button while the booking request is pending.

### 6.9 Invalid coupon / fare issue

If a coupon is invalid:
- booking fails.

Expected UI:
- Show the error clearly and do not proceed.

### 6.10 Driver not approved / not active

If the driver is not approved or inactive:
- they should not receive ride offers.

Expected UI:
- Show an appropriate “not available” state.

---

## 7. Recommended mobile app behavior checklist

### Rider app
- Keep the socket connection alive during ride search/booking.
- Disable the book button while a booking is pending.
- Handle `ride:no_driver` and `driver:assigned` events gracefully.
- Re-check ride status after reconnect.
- Show clear loading/error states for booking failures.

### Driver app
- Only allow ride accept if the driver is online and available.
- Handle incoming ride requests immediately.
- Disable accept if the driver is already assigned to another ride.
- Re-enter the available state after reconnect if appropriate.
- Show clear feedback when a ride is rejected or no longer available.

---

## 8. Summary

The mobile app should treat ride booking as a real-time, socket-driven workflow with strict handling for:
- online/offline reconnects,
- driver availability,
- ride rejection/re-offer,
- duplicate booking attempts,
- no-driver situations,
- and rider/driver state recovery.

If the app needs to support a more aggressive matching model later, the server logic should be extended to broadcast to multiple drivers instead of assigning one at a time.
