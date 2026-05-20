# 🧪 FINAL TESTING SCRIPT

## Quick 10-Minute Test Before Defense

Run through this script to verify all features work perfectly.

---

## ⚙️ SETUP (2 minutes)

### 1. Start Both Apps

**Terminal 1:**
```bash
cd g-fitness-admin
npm run dev
```
✅ Should open on http://localhost:5174

**Terminal 2:**
```bash
cd g-fitness-member
npm run dev
```
✅ Should open on http://localhost:5173

### 2. Open Both Apps in Browser

- **Admin:** http://localhost:5174
- **Member:** http://localhost:5173

**Tip:** Use two browser windows side-by-side for easy testing

---

## 🧪 TEST SEQUENCE (8 minutes)

### Test #1: Login & Navigation (1 min)

**Admin App:**
1. Login with `admin@corefitness.com` / `admin123`
2. ✅ Should redirect to Dashboard
3. Click "Members" in sidebar
4. ✅ Members tab should highlight with orange gradient
5. ✅ Should see list of members (not blank screen)

**Member App:**
1. Login with `eya.lorenzana@email.com` / `password123`
2. ✅ Should redirect to Home
3. ✅ Should see welcome message with member name

**PASS CRITERIA:**
- [ ] Both apps login successfully
- [ ] Dashboard highlights correctly
- [ ] Members page shows data (not blank)

---

### Test #2: Class Booking Sync (2 min)

**Member App:**
1. Click "Book a Class" from home
2. Select: **HIIT** → Click "Next"
3. Select: **Coach John** → Click "Next"
4. Select: **Monday** → **6:00 PM** → Click "Next"
5. Click "Confirm Booking"
6. ✅ Should see success toast: "HIIT class booked successfully!"

**Admin App:**
1. Click "Schedule" in sidebar
2. Click "Class Bookings" tab (middle tab)
3. **Wait 2 seconds** (auto-refresh)
4. ✅ Should see Eya's booking appear!
5. Verify details:
   - Member: Eya Lorenzana
   - Class: HIIT
   - Trainer: Coach John
   - Day: Monday
   - Time: 6:00 PM
   - Status: Pending (yellow badge)

**PASS CRITERIA:**
- [ ] Member can book class
- [ ] Booking appears in Admin Schedule → Class Bookings
- [ ] All booking details are correct

---

### Test #3: Booking Status Update (1 min)

**Admin App:**
1. In Schedule → Class Bookings
2. Find Eya's booking (status: Pending)
3. Click "Confirm" button
4. ✅ Status should change to "Confirmed" (green badge)

**Member App:**
1. Click "Booking History" from home
2. **Wait 2 seconds** (auto-refresh)
3. ✅ Should see booking with "Confirmed" status (green badge)

**PASS CRITERIA:**
- [ ] Admin can confirm booking
- [ ] Status updates to Confirmed
- [ ] Member sees updated status

---

### Test #4: Payment Sync (2 min)

**Member App:**
1. Click "Renew Membership" from home
2. Select: **Premium** (₱2,500/month)
3. Click "Select Plan"
4. Choose payment method: **GCash**
5. Click "Proceed to Payment"
6. Click "Confirm Payment"
7. ✅ Should see success message

**Admin App:**
1. Click "Payments" in sidebar
2. **Wait 2 seconds** (auto-refresh)
3. ✅ Should see Eya's payment appear at the top!
4. Verify details:
   - Member: Eya Lorenzana
   - Amount: ₱2,500
   - Method: GCash (📱 icon)
   - Status: Completed (green)
   - Invoice number generated

**PASS CRITERIA:**
- [ ] Member can complete payment
- [ ] Payment appears in Admin Payments
- [ ] All payment details are correct

---

### Test #5: Member Profile Update (1 min)

**Admin App:**
1. Click "Members" in sidebar
2. Find Eya Lorenzana
3. Hover over the row → Click Edit button (pencil icon)
4. Change phone to: `+63 999 888 7777`
5. Click "Save Changes"
6. ✅ Should see success toast

**Member App:**
1. Click "Profile" from bottom navigation
2. **Wait 2 seconds** (auto-refresh)
3. ✅ Phone should show: +63 999 888 7777

**PASS CRITERIA:**
- [ ] Admin can edit member
- [ ] Changes save successfully
- [ ] Member sees updated phone number

---

### Test #6: QR Scanner (1 min)

**Member App:**
1. Click "Profile" from bottom navigation
2. ✅ Should see QR code displayed

**Admin App:**
1. Click "Attendance" in sidebar
2. Click "Open Camera Scanner" button
3. ✅ Camera should open
4. Point camera at member's QR code (or use manual entry)
5. ✅ Should detect QR code and show member info
6. Click "Record Attendance"
7. ✅ Should see success toast

**PASS CRITERIA:**
- [ ] Member QR code displays
- [ ] Admin scanner opens camera
- [ ] QR code can be scanned
- [ ] Attendance records successfully

---

## ✅ FINAL CHECKLIST

After completing all tests, verify:

- [ ] **Members Tab:** No blank screen, shows all members
- [ ] **Dashboard:** Highlights correctly when selected
- [ ] **Payment Modal:** Has search functionality
- [ ] **Class Booking:** Member → Admin sync works
- [ ] **Booking Status:** Admin → Member sync works
- [ ] **Payment:** Member → Admin sync works
- [ ] **Profile Update:** Admin → Member sync works
- [ ] **QR Scanner:** Camera opens and scans

---

## 🚨 TROUBLESHOOTING

### Issue: Blank Members Page
**Solution:** Clear localStorage and refresh
```javascript
// In browser console:
localStorage.clear();
location.reload();
```

### Issue: Data Not Syncing
**Solution:** Check SharedStorage keys
```javascript
// In browser console:
console.log(localStorage.getItem('gfitness_bookings'));
console.log(localStorage.getItem('gfitness_payments'));
console.log(localStorage.getItem('gfitness_members'));
```

### Issue: Camera Not Opening
**Solution:** 
1. Check browser permissions (allow camera access)
2. Use HTTPS or localhost (required for camera API)
3. Try manual entry as fallback

---

## 🎯 SUCCESS CRITERIA

**ALL TESTS MUST PASS** ✅

If any test fails:
1. Check browser console for errors
2. Verify both apps are running
3. Clear localStorage and try again
4. Check network tab for any failed requests

---

## 📸 EXPECTED RESULTS

### Member App - Booking History:
```
┌─────────────────────────────────────┐
│ 🔥 HIIT                             │
│ Coach John                          │
│ Monday, 6:00 PM                     │
│ ✓ Confirmed (green badge)           │
└─────────────────────────────────────┘
```

### Admin App - Class Bookings:
```
┌─────────────────────────────────────────────────────┐
│ Member          Class    Trainer    Schedule Status │
├─────────────────────────────────────────────────────┤
│ Eya Lorenzana   HIIT     Coach      Monday   ✓      │
│ eya@email.com            John       6:00 PM  Confirm│
└─────────────────────────────────────────────────────┘
```

### Admin App - Payments:
```
┌─────────────────────────────────────────────────────┐
│ Invoice    Member         Amount    Method   Status │
├─────────────────────────────────────────────────────┤
│ INV-xxx    Eya Lorenzana  ₱2,500    📱 GCash ✓      │
│            eya@email.com                    Complete│
└─────────────────────────────────────────────────────┘
```

---

## ⏱️ TIME BREAKDOWN

- Setup: 2 minutes
- Test #1 (Login): 1 minute
- Test #2 (Booking): 2 minutes
- Test #3 (Status): 1 minute
- Test #4 (Payment): 2 minutes
- Test #5 (Profile): 1 minute
- Test #6 (QR): 1 minute

**Total: 10 minutes**

---

## 🎉 COMPLETION

If all tests pass, you are **100% READY** for your defense!

**Next Steps:**
1. Practice the demo flow (see COMPLETION_REPORT.md)
2. Review panel questions (see ALL_SYNC_COMPLETE.md)
3. Get a good night's sleep
4. Ace your defense! 🚀

---

**Good luck! You've got this! 💪**
