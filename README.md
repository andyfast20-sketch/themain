# Pay As You Mow booking platform

This project powers the Pay As You Mow marketing site, customer booking flow, and the internal appointment calendar. The public page lets visitors reserve consultation slots, while the password-protected admin calendar provides a full month/week view with tools to add, edit, or delete bookings.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the application:
   ```bash
   npm start
   ```
   The site runs on [http://localhost:3000](http://localhost:3000).

## Admin calendar

* Access the admin calendar at `http://localhost:3000/admin`.
* The default password is **`garden-admin`**. Change it after the first login from the Security panel.
* Appointments are stored in `data/appointments.json`. Password hashes live in `data/admin.json`.

Changes you make in the admin calendar appear instantly on the public booking grid, and new public bookings show up on the admin calendar in real time.

## Project structure

```
public/
  index.html         # marketing site + booking flow
  admin.html         # admin calendar UI
  js/admin.js        # admin calendar behaviour
server.js            # Express server + API endpoints
package.json         # scripts and dependencies
data/
  appointments.json  # persistent appointment storage
  admin.json         # admin password hash (created automatically)
```

## Available scripts

* `npm start` – run the production server.
* `npm run dev` – start the server with hot reload via nodemon.

## Notes

* Appointment conflicts are prevented server-side; overlapping slots return a `409` response.
* The booking UI shows when a slot has just been taken so customers can choose another time.
* Admin sessions last up to 12 hours and can be ended with the **Sign out** button.
