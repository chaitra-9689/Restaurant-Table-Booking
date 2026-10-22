# Restaurant Table Booking – Test Cases & Results

**Run date:** 22 Oct 2026, 13:49  
**Target:** https://restaurant-table-booking-omega.vercel.app  
**Backend:** Supabase (credentials from `.env`)  
**Tool:** Playwright 1.57 (Chromium, headless, 1280×800, one continuous session)  
**Result:** 30/30 passed (100%) in 57.3 s  
**Recording:** `testing_recording/E2E_Test_Run_20261022_0819.mp4` · **Screenshots:** `testing_ss/` · **Excel:** `Test_Report.xlsx`

## How the suite works

1. **Global setup** (`tests/support/global-setup.js`) clears old screenshots/recordings, removes leftovers from any
   previous run, snapshots the site settings it will touch, and creates a temporary confirmed CRM admin
   (`e2e-admin@e2e.test`, password stored in `.env`) directly in Supabase.
2. **Tests** (`tests/e2e.spec.js`) run serially in one browser session so the whole run is one video. Later tests
   reuse data from earlier ones (e.g. the booking reference from TC08 is looked up in TC10 and edited in TC21).
   A screenshot is taken at key steps and after every test (`<ID>_PASS|FAIL_<name>.png`).
3. **Global teardown** restores the settings snapshot and deletes everything tagged as test data
   (emails `@e2e.test`, names starting `E2E`), including the temporary admin.
4. **Report** (`scripts/test-report.js`) builds this file, the Excel workbook and converts the recording to MP4.

Run it again with `npm run test:e2e` (set `E2E_BASE_URL=http://localhost:3000` to test locally).

## Summary

| ID | Module | Test case | Priority | Status |
|----|--------|-----------|----------|--------|
| TC01 | Website – Home | Home page loads with branding from Supabase | High | ✅ PASS |
| TC02 | Website – Navigation | Header navigation scrolls to page sections | Medium | ✅ PASS |
| TC03 | Website – Menu | Menu tabs filter dishes by category | Medium | ✅ PASS |
| TC04 | Website – Visit | Opening hours and contact details are shown | Low | ✅ PASS |
| TC05 | Website – Booking | Booking form defaults and closed-day message | High | ✅ PASS |
| TC06 | Website – Booking | Available time slots load and a slot can be selected | High | ✅ PASS |
| TC07 | Website – Booking | Guest details are validated before booking | High | ✅ PASS |
| TC08 | Website – Booking | Guest can book a table and receives a reference | Critical | ✅ PASS |
| TC09 | Website – Booking | Fully-booked times disappear (no double booking) | Critical | ✅ PASS |
| TC10 | Website – Manage booking | Guest can look up a booking with reference and email | High | ✅ PASS |
| TC11 | Website – Manage booking | Lookup with the wrong email is rejected | High | ✅ PASS |
| TC12 | Website – Manage booking | Guest can cancel a booking and the slot is released | High | ✅ PASS |
| TC13 | Website – Responsive | Website works at mobile width | Medium | ✅ PASS |
| TC14 | Security | Anonymous visitors cannot read private data | Critical | ✅ PASS |
| TC15 | CRM – Auth | CRM rejects invalid credentials | High | ✅ PASS |
| TC16 | CRM – Auth | Create-account form switches mode and validates password | Medium | ✅ PASS |
| TC17 | CRM – Auth | Admin can sign in and sees the dashboard | Critical | ✅ PASS |
| TC18 | CRM – Bookings | Staff can create a phone booking | Critical | ✅ PASS |
| TC19 | CRM – Bookings | Bookings list filters and search | High | ✅ PASS |
| TC20 | CRM – Bookings | Booking status can be changed inline | High | ✅ PASS |
| TC21 | CRM – Bookings | Booking can be edited (party size and internal note) | High | ✅ PASS |
| TC22 | CRM – Customers | Customer profile: tags and VIP | High | ✅ PASS |
| TC23 | CRM – Security | HTML in guest input is shown as text (XSS protection) | High | ✅ PASS |
| TC24 | CRM – Tables | Tables can be added and deleted | Medium | ✅ PASS |
| TC25 | CRM – Website content | Menu dish added in CRM appears on the website | High | ✅ PASS |
| TC26 | CRM – Website content | Site settings update the website | High | ✅ PASS |
| TC27 | CRM – Booking rules | Online booking can be paused | High | ✅ PASS |
| TC28 | CRM – Booking rules | Manual confirmation flow (auto-confirm off) | High | ✅ PASS |
| TC29 | CRM – Staff | Admin can invite and revoke staff | Medium | ✅ PASS |
| TC30 | CRM – Auth | Sign out returns to the login screen | High | ✅ PASS |

## Test cases in detail

### TC01 – Home page loads with branding from Supabase

**Module:** Website – Home · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.7 s

**Preconditions:** Site is deployed; site_settings row exists in Supabase.

**Steps:**

1. Open the website home page (/).
2. Wait for the page to finish loading data from Supabase.
3. Check the browser tab title contains the restaurant name.
4. Check the header shows the restaurant logo image and the restaurant name.
5. Check the hero section shows the tagline, headline and the "Reserve your table" button.

**Expected result:** Title is "<Restaurant> – Book a Table"; logo, name, tagline, headline and CTA are visible.

**Actual result:** As expected. Title is "<Restaurant> – Book a Table"; logo, name, tagline, headline and CTA are visible.

**Screenshots:** [TC01_PASS_home-page-loads-with-branding-from-supabase.png](testing_ss/TC01_PASS_home-page-loads-with-branding-from-supabase.png)

### TC02 – Header navigation scrolls to page sections

**Module:** Website – Navigation · **Priority:** Medium · **Status:** ✅ PASS · **Duration:** 0.9 s

**Preconditions:** Home page is open at desktop width.

**Steps:**

1. Click "Menu" in the header.
2. Check the Menu section is scrolled into view.
3. Click "Visit" in the header.
4. Check the Opening hours section is in view.
5. Click the "Book a table" header button.
6. Check the booking form is in view.

**Expected result:** Each link brings its section into the viewport.

**Actual result:** As expected. Each link brings its section into the viewport.

**Screenshots:** [TC02_step1_menu-section.png](testing_ss/TC02_step1_menu-section.png), [TC02_step2_visit-section.png](testing_ss/TC02_step2_visit-section.png), [TC02_PASS_header-navigation-scrolls-to-page-sections.png](testing_ss/TC02_PASS_header-navigation-scrolls-to-page-sections.png)

### TC03 – Menu tabs filter dishes by category

**Module:** Website – Menu · **Priority:** Medium · **Status:** ✅ PASS · **Duration:** 0.8 s

**Preconditions:** Menu items exist; at least one is featured.

**Steps:**

1. Scroll to the Menu section.
2. Check the "Highlights" tab is selected by default and lists featured dishes.
3. Click the "Pasta" tab.
4. Check the "Pasta" tab becomes selected and only pasta dishes (e.g. "Cacio e pepe") are shown with prices.
5. Click the "Desserts" tab and check "Tiramisù" is listed.

**Expected result:** Tabs switch the visible dishes; selected tab is highlighted; prices are shown.

**Actual result:** As expected. Tabs switch the visible dishes; selected tab is highlighted; prices are shown.

**Screenshots:** [TC03_step1_highlights.png](testing_ss/TC03_step1_highlights.png), [TC03_step2_pasta-tab.png](testing_ss/TC03_step2_pasta-tab.png), [TC03_PASS_menu-tabs-filter-dishes-by-category.png](testing_ss/TC03_PASS_menu-tabs-filter-dishes-by-category.png)

### TC04 – Opening hours and contact details are shown

**Module:** Website – Visit · **Priority:** Low · **Status:** ✅ PASS · **Duration:** 0.2 s

**Preconditions:** Default opening hours (Monday closed).

**Steps:**

1. Scroll to the "Visit" section.
2. Count the rows in the opening-hours table.
3. Check the Monday row says "Closed".
4. Check the phone link starts with "tel:" and the email link starts with "mailto:".

**Expected result:** 7 rows (Mon–Sun); Monday shows Closed; contact links are clickable tel:/mailto: links.

**Actual result:** As expected. 7 rows (Mon–Sun); Monday shows Closed; contact links are clickable tel:/mailto: links.

**Screenshots:** [TC04_PASS_opening-hours-and-contact-details-are-shown.png](testing_ss/TC04_PASS_opening-hours-and-contact-details-are-shown.png)

### TC05 – Booking form defaults and closed-day message

**Module:** Website – Booking · **Priority:** High · **Status:** ✅ PASS · **Duration:** 0.9 s

**Preconditions:** Online booking enabled; Monday is a closed day.

**Steps:**

1. Scroll to the booking form.
2. Check the date field defaults to today (restaurant timezone).
3. Check the Guests dropdown offers 1 to the maximum party size (10).
4. Change the date to the next Monday.
5. Check the available-times area shows "We’re closed on this day."

**Expected result:** Date defaults to today, party sizes 1–10 are listed, a closed day shows the closed message instead of times.

**Actual result:** As expected. Date defaults to today, party sizes 1–10 are listed, a closed day shows the closed message instead of times.

**Screenshots:** [TC05_step1_defaults.png](testing_ss/TC05_step1_defaults.png), [TC05_PASS_booking-form-defaults-and-closed-day-message.png](testing_ss/TC05_PASS_booking-form-defaults-and-closed-day-message.png)

### TC06 – Available time slots load and a slot can be selected

**Module:** Website – Booking · **Priority:** High · **Status:** ✅ PASS · **Duration:** 0.9 s

**Preconditions:** An open day at least 2 days ahead.

**Steps:**

1. Set the date to an open day 2+ days ahead and Guests to 2.
2. Wait for the time-slot buttons to load from Supabase (get_available_slots RPC).
3. Click the first available time.
4. Check step 2 (guest details) is shown with a summary of date, time and party size.

**Expected result:** Slots load as buttons; picking one shows the details form with the correct summary.

**Actual result:** As expected. Slots load as buttons; picking one shows the details form with the correct summary.

**Screenshots:** [TC06_step1_slots-loaded.png](testing_ss/TC06_step1_slots-loaded.png), [TC06_PASS_available-time-slots-load-and-a-slot-can-be-selected.png](testing_ss/TC06_PASS_available-time-slots-load-and-a-slot-can-be-selected.png)

### TC07 – Guest details are validated before booking

**Module:** Website – Booking · **Priority:** High · **Status:** ✅ PASS · **Duration:** 3.6 s

**Preconditions:** A slot has been selected (TC06).

**Steps:**

1. Leave all fields empty and click "Confirm booking" → expect "Please enter your name."
2. Enter a name and the invalid email "not-an-email" → expect "Please enter a valid email address."
3. Enter a valid email and the phone "12" → expect "Please enter a valid phone number."
4. Click "Back" and check the time-slot step is shown again, then re-select the slot.

**Expected result:** Each invalid input shows a clear error and no booking is created; Back returns to slot selection.

**Actual result:** As expected. Each invalid input shows a clear error and no booking is created; Back returns to slot selection.

**Screenshots:** [TC07_step1_name-required.png](testing_ss/TC07_step1_name-required.png), [TC07_step2_invalid-email.png](testing_ss/TC07_step2_invalid-email.png), [TC07_step3_invalid-phone.png](testing_ss/TC07_step3_invalid-phone.png), [TC07_PASS_guest-details-are-validated-before-booking.png](testing_ss/TC07_PASS_guest-details-are-validated-before-booking.png)

### TC08 – Guest can book a table and receives a reference

**Module:** Website – Booking · **Priority:** Critical · **Status:** ✅ PASS · **Duration:** 1.0 s

**Preconditions:** Slot selected; valid guest data.

**Steps:**

1. Fill Full name "E2E Website Guest", phone "+65 9123 4567", email "guest@e2e.test", special request "Window seat please".
2. Click "Confirm booking".
3. Wait for the confirmation panel.
4. Check the heading says "You’re booked!" and the booking reference matches the format TB-XXXXXX.
5. Store the reference for later tests.

**Expected result:** Booking is created in Supabase; confirmation with a TB-XXXXXX reference is displayed.

**Actual result:** As expected. Booking is created in Supabase; confirmation with a TB-XXXXXX reference is displayed.

**Screenshots:** [TC08_step1_details-filled.png](testing_ss/TC08_step1_details-filled.png), [TC08_PASS_guest-can-book-a-table-and-receives-a-reference.png](testing_ss/TC08_PASS_guest-can-book-a-table-and-receives-a-reference.png)

### TC09 – Fully-booked times disappear (no double booking)

**Module:** Website – Booking · **Priority:** Critical · **Status:** ✅ PASS · **Duration:** 3.0 s

**Preconditions:** Only one 10-seat table exists.

**Steps:**

1. Click "Make another booking".
2. Choose another open day and Guests = 10; check the 7:00 PM slot is offered.
3. Book 7:00 PM for 10 guests as "E2E Big Party" (bigparty@e2e.test).
4. Start a new booking for the same day and 10 guests.
5. Check 7:00 PM (and overlapping times) are no longer offered for 10 guests.

**Expected result:** Once the only 10-seat table is taken, overlapping slots are hidden for that party size.

**Actual result:** As expected. Once the only 10-seat table is taken, overlapping slots are hidden for that party size.

**Screenshots:** [TC09_step1_19-00-available-for-10.png](testing_ss/TC09_step1_19-00-available-for-10.png), [TC09_step2_big-party-booked.png](testing_ss/TC09_step2_big-party-booked.png), [TC09_PASS_fully-booked-times-disappear-no-double-booking.png](testing_ss/TC09_PASS_fully-booked-times-disappear-no-double-booking.png)

### TC10 – Guest can look up a booking with reference and email

**Module:** Website – Manage booking · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.0 s

**Preconditions:** Booking from TC08 exists.

**Steps:**

1. Open /manage.
2. Enter the TC08 reference and "guest@e2e.test", click "Find booking".
3. Check the result shows the guest name, status "confirmed", 2 guests and the special request.

**Expected result:** Booking details are displayed for the matching reference + email.

**Actual result:** As expected. Booking details are displayed for the matching reference + email.

**Screenshots:** [TC10_PASS_guest-can-look-up-a-booking-with-reference-and-email.png](testing_ss/TC10_PASS_guest-can-look-up-a-booking-with-reference-and-email.png)

### TC11 – Lookup with the wrong email is rejected

**Module:** Website – Manage booking · **Priority:** High · **Status:** ✅ PASS · **Duration:** 0.6 s

**Preconditions:** Booking from TC08 exists.

**Steps:**

1. On /manage enter the TC08 reference with "someone-else@e2e.test".
2. Click "Find booking".
3. Check the error "We couldn’t find a booking with those details." is shown and no details are displayed.

**Expected result:** No booking data is revealed without the matching email.

**Actual result:** As expected. No booking data is revealed without the matching email.

**Screenshots:** [TC11_PASS_lookup-with-the-wrong-email-is-rejected.png](testing_ss/TC11_PASS_lookup-with-the-wrong-email-is-rejected.png)

### TC12 – Guest can cancel a booking and the slot is released

**Module:** Website – Manage booking · **Priority:** High · **Status:** ✅ PASS · **Duration:** 2.2 s

**Preconditions:** Big-party booking from TC09 exists.

**Steps:**

1. On /manage look up the TC09 reference with "bigparty@e2e.test".
2. Click "Cancel booking" and accept the confirmation dialog.
3. Check the status changes to "cancelled" and the Cancel button disappears.
4. Go back to the booking form, choose the same day and 10 guests.
5. Check the 7:00 PM slot is offered again.

**Expected result:** Booking is cancelled and its table time becomes bookable again.

**Actual result:** As expected. Booking is cancelled and its table time becomes bookable again.

**Screenshots:** [TC12_step1_before-cancel.png](testing_ss/TC12_step1_before-cancel.png), [TC12_step2_cancelled.png](testing_ss/TC12_step2_cancelled.png), [TC12_PASS_guest-can-cancel-a-booking-and-the-slot-is-released.png](testing_ss/TC12_PASS_guest-can-cancel-a-booking-and-the-slot-is-released.png)

### TC13 – Website works at mobile width

**Module:** Website – Responsive · **Priority:** Medium · **Status:** ✅ PASS · **Duration:** 0.6 s

**Preconditions:** None.

**Steps:**

1. Resize the browser to 390×844 (iPhone size) and reload the home page.
2. Check secondary nav links are hidden and the "Book a table" button is visible.
3. Check the page has no horizontal scroll.
4. Restore desktop size.

**Expected result:** Layout adapts to mobile without horizontal scrolling.

**Actual result:** As expected. Layout adapts to mobile without horizontal scrolling.

**Screenshots:** [TC13_step1_mobile-booking-form.png](testing_ss/TC13_step1_mobile-booking-form.png), [TC13_PASS_website-works-at-mobile-width.png](testing_ss/TC13_PASS_website-works-at-mobile-width.png)

### TC14 – Anonymous visitors cannot read private data

**Module:** Security · **Priority:** Critical · **Status:** ✅ PASS · **Duration:** 1.2 s

**Preconditions:** Bookings and customers exist (TC08).

**Steps:**

1. Using the public anon key (same as the browser), query /rest/v1/bookings and /rest/v1/customers.
2. Try to insert a row into restaurant_tables and update site_settings as anonymous.
3. Query /rest/v1/site_settings and /rest/v1/menu_items.

**Expected result:** Bookings/customers return 0 rows; writes are rejected or affect 0 rows; public content is readable.

**Actual result:** As expected. Bookings/customers return 0 rows; writes are rejected or affect 0 rows; public content is readable.

**Screenshots:** [TC14_PASS_anonymous-visitors-cannot-read-private-data.png](testing_ss/TC14_PASS_anonymous-visitors-cannot-read-private-data.png)

### TC15 – CRM rejects invalid credentials

**Module:** CRM – Auth · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.5 s

**Preconditions:** Signed out.

**Steps:**

1. Open /crm and check the "Staff sign in" screen with logo is shown.
2. Enter the test admin email with a wrong password and click "Sign in".
3. Check an "Invalid login credentials" error is displayed and the dashboard is not shown.

**Expected result:** Sign-in fails with a clear error message.

**Actual result:** As expected. Sign-in fails with a clear error message.

**Screenshots:** [TC15_PASS_crm-rejects-invalid-credentials.png](testing_ss/TC15_PASS_crm-rejects-invalid-credentials.png)

### TC16 – Create-account form switches mode and validates password

**Module:** CRM – Auth · **Priority:** Medium · **Status:** ✅ PASS · **Duration:** 1.3 s

**Preconditions:** On the CRM sign-in screen.

**Steps:**

1. Click "Create an account".
2. Check the title changes to "Create staff account" and a Full name field appears.
3. Enter an email with the 3-character password "abc" and submit.
4. Check the message "Enter your email and a password of at least 6 characters." appears.
5. Click "Sign in" to switch back.

**Expected result:** Mode toggles correctly; short passwords are rejected before contacting Supabase.

**Actual result:** As expected. Mode toggles correctly; short passwords are rejected before contacting Supabase.

**Screenshots:** [TC16_step1_short-password-rejected.png](testing_ss/TC16_step1_short-password-rejected.png), [TC16_PASS_create-account-form-switches-mode-and-validates-password.png](testing_ss/TC16_PASS_create-account-form-switches-mode-and-validates-password.png)

### TC17 – Admin can sign in and sees the dashboard

**Module:** CRM – Auth · **Priority:** Critical · **Status:** ✅ PASS · **Duration:** 1.4 s

**Preconditions:** Test admin account (created by the suite) exists.

**Steps:**

1. Enter the test admin email and password from .env and click "Sign in".
2. Check the Dashboard heading and the 4 stat cards are shown.
3. Check the sidebar shows the user name "E2E Test Admin" with role "admin" and the admin-only "Staff" link.

**Expected result:** Admin lands on the dashboard with full navigation.

**Actual result:** As expected. Admin lands on the dashboard with full navigation.

**Screenshots:** [TC17_PASS_admin-can-sign-in-and-sees-the-dashboard.png](testing_ss/TC17_PASS_admin-can-sign-in-and-sees-the-dashboard.png)

### TC18 – Staff can create a phone booking

**Module:** CRM – Bookings · **Priority:** Critical · **Status:** ✅ PASS · **Duration:** 1.6 s

**Preconditions:** Signed in as admin.

**Steps:**

1. Click "+ New booking".
2. Fill guest "E2E Phone Guest", phone "+65 8000 1111", email "phone@e2e.test", date today, time 21:00, 4 guests, source Phone, table Auto-assign.
3. Click "Create booking".
4. Check the toast "Booking TB-… created" appears.
5. Check the dashboard "Today" list shows "E2E Phone Guest" with 4 guests and a table.

**Expected result:** Booking is created by staff, auto-assigned a table and appears on today’s dashboard.

**Actual result:** As expected. Booking is created by staff, auto-assigned a table and appears on today’s dashboard.

**Screenshots:** [TC18_step1_new-booking-form.png](testing_ss/TC18_step1_new-booking-form.png), [TC18_PASS_staff-can-create-a-phone-booking.png](testing_ss/TC18_PASS_staff-can-create-a-phone-booking.png)

### TC19 – Bookings list filters and search

**Module:** CRM – Bookings · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.6 s

**Preconditions:** Website booking from TC08 exists.

**Steps:**

1. Open Bookings in the sidebar.
2. Click the "Next 7 days" preset.
3. Type the TC08 reference into Search.
4. Check exactly one row is shown for "E2E Website Guest" with source "Website".
5. Set Status filter to "Cancelled" and check the website booking disappears; reset to "All".

**Expected result:** Date presets, search and status filter narrow the list correctly.

**Actual result:** As expected. Date presets, search and status filter narrow the list correctly.

**Screenshots:** [TC19_step1_search-by-reference.png](testing_ss/TC19_step1_search-by-reference.png), [TC19_PASS_bookings-list-filters-and-search.png](testing_ss/TC19_PASS_bookings-list-filters-and-search.png)

### TC20 – Booking status can be changed inline

**Module:** CRM – Bookings · **Priority:** High · **Status:** ✅ PASS · **Duration:** 0.4 s

**Preconditions:** Filtered list from TC19.

**Steps:**

1. In the website booking row change the status dropdown to "seated".
2. Check the toast "Booking marked seated" appears.
3. Check the dropdown still shows "seated" after the list reloads.

**Expected result:** Status is saved to Supabase and reflected in the list.

**Actual result:** As expected. Status is saved to Supabase and reflected in the list.

**Screenshots:** [TC20_PASS_booking-status-can-be-changed-inline.png](testing_ss/TC20_PASS_booking-status-can-be-changed-inline.png)

### TC21 – Booking can be edited (party size and internal note)

**Module:** CRM – Bookings · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.4 s

**Preconditions:** Website booking visible in the list.

**Steps:**

1. Click the website booking row to open the edit dialog.
2. Check guest name, contact and source are displayed.
3. Change Guests to 3 and enter Internal notes "E2E note: birthday cake".
4. Click "Save" and check the toast "Booking updated".
5. Check the row now shows 3 guests and a note icon.

**Expected result:** Changes are saved and visible in the list.

**Actual result:** As expected. Changes are saved and visible in the list.

**Screenshots:** [TC21_step1_edit-dialog.png](testing_ss/TC21_step1_edit-dialog.png), [TC21_PASS_booking-can-be-edited-party-size-and-internal-note.png](testing_ss/TC21_PASS_booking-can-be-edited-party-size-and-internal-note.png)

### TC22 – Customer profile: tags and VIP

**Module:** CRM – Customers · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.8 s

**Preconditions:** Customers created by the bookings above.

**Steps:**

1. Open Customers and search "e2e.test".
2. Check "E2E Website Guest" is listed with 1 booking.
3. Open the customer, check the booking history table is shown.
4. Enter tags "regular, window-seat", tick "VIP guest", click "Save".
5. Check the row shows the VIP badge and both tags.

**Expected result:** Customer CRM data is saved and displayed.

**Actual result:** As expected. Customer CRM data is saved and displayed.

**Screenshots:** [TC22_step1_customer-profile.png](testing_ss/TC22_step1_customer-profile.png), [TC22_PASS_customer-profile-tags-and-vip.png](testing_ss/TC22_PASS_customer-profile-tags-and-vip.png)

### TC23 – HTML in guest input is shown as text (XSS protection)

**Module:** CRM – Security · **Priority:** High · **Status:** ✅ PASS · **Duration:** 1.5 s

**Preconditions:** Signed in as admin.

**Steps:**

1. Create a phone booking for guest name "E2E <b>Bold</b> Guest".
2. Open Customers and search "Bold".
3. Check the name is shown literally including "<b>" and no <b> element was injected into the page.

**Expected result:** User-supplied HTML is escaped, not rendered.

**Actual result:** As expected. User-supplied HTML is escaped, not rendered.

**Screenshots:** [TC23_PASS_html-in-guest-input-is-shown-as-text-xss-protection.png](testing_ss/TC23_PASS_html-in-guest-input-is-shown-as-text-xss-protection.png)

### TC24 – Tables can be added and deleted

**Module:** CRM – Tables · **Priority:** Medium · **Status:** ✅ PASS · **Duration:** 2.1 s

**Preconditions:** Signed in as admin.

**Steps:**

1. Open Tables and click "+ Add table".
2. Enter name "E2E-T99", 4 seats, area "Test", click "Save".
3. Check "E2E-T99" appears in the list.
4. Open it, click "Delete" and accept the confirmation.
5. Check "E2E-T99" is no longer listed.

**Expected result:** Table CRUD works.

**Actual result:** As expected. Table CRUD works.

**Screenshots:** [TC24_step1_table-added.png](testing_ss/TC24_step1_table-added.png), [TC24_PASS_tables-can-be-added-and-deleted.png](testing_ss/TC24_PASS_tables-can-be-added-and-deleted.png)

### TC25 – Menu dish added in CRM appears on the website

**Module:** CRM – Website content · **Priority:** High · **Status:** ✅ PASS · **Duration:** 3.4 s

**Preconditions:** Signed in as admin.

**Steps:**

1. Open Menu and click "+ Add dish".
2. Enter "E2E Test Dish", category "Desserts", price 9.50, tick Featured and Visible, click "Save".
3. Open the public website and check "E2E Test Dish" appears under Highlights.
4. Return to the CRM Menu, open the dish and delete it.
5. Check it is removed from the CRM list.

**Expected result:** Menu changes in the CRM are published to the website immediately.

**Actual result:** As expected. Menu changes in the CRM are published to the website immediately.

**Screenshots:** [TC25_step1_dish-on-website.png](testing_ss/TC25_step1_dish-on-website.png), [TC25_PASS_menu-dish-added-in-crm-appears-on-the-website.png](testing_ss/TC25_PASS_menu-dish-added-in-crm-appears-on-the-website.png)

### TC26 – Site settings update the website

**Module:** CRM – Website content · **Priority:** High · **Status:** ✅ PASS · **Duration:** 2.9 s

**Preconditions:** Signed in as admin.

**Steps:**

1. Open "Site & booking settings".
2. Change Tagline to "E2E tagline check" and click "Save changes".
3. Check the toast "Website updated".
4. Open the website and check the hero tagline shows "E2E tagline check".
5. Return to settings and restore the original tagline.

**Expected result:** Content edits in the CRM are reflected on the public site.

**Actual result:** As expected. Content edits in the CRM are reflected on the public site.

**Screenshots:** [TC26_step1_new-tagline-on-website.png](testing_ss/TC26_step1_new-tagline-on-website.png), [TC26_PASS_site-settings-update-the-website.png](testing_ss/TC26_PASS_site-settings-update-the-website.png)

### TC27 – Online booking can be paused

**Module:** CRM – Booking rules · **Priority:** High · **Status:** ✅ PASS · **Duration:** 3.3 s

**Preconditions:** Signed in as admin.

**Steps:**

1. In settings untick "Accept online bookings" and save.
2. Open the website and check "Online booking is paused" is shown instead of the form.
3. Return to settings, tick "Accept online bookings" again and save.

**Expected result:** The booking form is hidden while online booking is paused.

**Actual result:** As expected. The booking form is hidden while online booking is paused.

**Screenshots:** [TC27_step1_booking-paused.png](testing_ss/TC27_step1_booking-paused.png), [TC27_PASS_online-booking-can-be-paused.png](testing_ss/TC27_PASS_online-booking-can-be-paused.png)

### TC28 – Manual confirmation flow (auto-confirm off)

**Module:** CRM – Booking rules · **Priority:** High · **Status:** ✅ PASS · **Duration:** 6.7 s

**Preconditions:** Signed in as admin in the same browser – the website must still treat the visitor as an anonymous guest.

**Steps:**

1. In settings untick "Auto-confirm bookings" and save.
2. On the website book a table as "E2E Pending Guest" (pending@e2e.test).
3. Check the confirmation says "Request received!".
4. Open the CRM dashboard and check "E2E Pending Guest" is under "Awaiting confirmation" and the Bookings badge shows a count.
5. Click "Confirm" and check the toast "Booking confirmed".
6. Re-enable auto-confirm in settings.

**Expected result:** Bookings wait as pending until staff confirm them.

**Actual result:** As expected. Bookings wait as pending until staff confirm them.

**Screenshots:** [TC28_step1_request-received.png](testing_ss/TC28_step1_request-received.png), [TC28_step2_awaiting-confirmation.png](testing_ss/TC28_step2_awaiting-confirmation.png), [TC28_PASS_manual-confirmation-flow-auto-confirm-off.png](testing_ss/TC28_PASS_manual-confirmation-flow-auto-confirm-off.png)

### TC29 – Admin can invite and revoke staff

**Module:** CRM – Staff · **Priority:** Medium · **Status:** ✅ PASS · **Duration:** 1.9 s

**Preconditions:** Signed in as admin.

**Steps:**

1. Open Staff and check the Team table lists "E2E Test Admin (you)".
2. Click "+ Invite staff", enter "invitee@e2e.test", role Staff, click "Send invite".
3. Check the invite appears under "Pending invites".
4. Click "Revoke" and check the invite is removed.

**Expected result:** Invites are created and revoked.

**Actual result:** As expected. Invites are created and revoked.

**Screenshots:** [TC29_step1_invite-pending.png](testing_ss/TC29_step1_invite-pending.png), [TC29_PASS_admin-can-invite-and-revoke-staff.png](testing_ss/TC29_PASS_admin-can-invite-and-revoke-staff.png)

### TC30 – Sign out returns to the login screen

**Module:** CRM – Auth · **Priority:** High · **Status:** ✅ PASS · **Duration:** 0.8 s

**Preconditions:** Signed in.

**Steps:**

1. Click the sign-out button in the sidebar.
2. Check the "Staff sign in" screen is shown and the app shell is hidden.
3. Reload /crm and check it still shows the sign-in screen (session cleared).

**Expected result:** User is signed out and the session is not restored.

**Actual result:** As expected. User is signed out and the session is not restored.

**Screenshots:** [TC30_PASS_sign-out-returns-to-the-login-screen.png](testing_ss/TC30_PASS_sign-out-returns-to-the-login-screen.png)
