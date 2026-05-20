# 🧪 TEST COMPLETE BOOKING FLOW - 5 MINUTES

## ✅ What We're Testing

The complete end-to-end trainer booking workflow:
1. Member books class (Pending status)
2. Admin sees pending notification
3. Admin approves with note
4. Member sees confirmed status + note
5. Admin rejects another booking
6. Member sees rejection reason

---

## 🚀 START BOTH APPS

**Terminal 1:**
```bash
cd g-fitness-admin
npm run dev
```
Opens on: http://localhost:5174

**Terminal 2:**
```bash
cd g-fitness-member
npm run dev
```
Opens on: http://localhost:5173

---

## 📱 TEST 1: APPROVE FLOW (3 min)

### Member App (localhost:5173)

**Step 1: Login**
- Email: `eya.lorenzana@email.com`
- Password: `password123`
- ✅ Should redirect to Home

**Step 2: Book a Class**
1. Click "Book a Class"
2. Select **HIIT** (🔥 icon)
3. Click "Next"
4. Select **Coach John**
5. Click "Next"
6. Select **Monday**
7. Click "Next"
8. Select **6:00 PM**
9. Review summary
10. Click "Confirm Booking"
11. ✅ See success toast
12. ✅ Redirects to Booking History

**Step 3: Check Status**
1. In Booking History
2. ✅ See HIIT booking
3. ✅ Status shows **"Pending"** (yellow badge)
4. ✅ Yellow alert icon next to status

---

### Admin App (localhost:5174)

**Step 4: Check Dashboard**
1. Login: `admin@corefitness.com` / `admin123`
2. ✅ Dashboard loads
3. Look at "Quick Stats" section (right side)
4. ✅ See **"Pending Booking Requests: 1"**
5. ✅ Yellow badge with number "1" is **animating/pulsing**
6. Click on "Pending Booking Requests"
7. ✅ Navigates to Schedule page

**Step 5: Approve Booking**
1. Should be on Schedule page
2. Click **"Class Bookings"** tab (middle tab)
3. ✅ See Eya's booking:
   - Member: Eya Lorenzana
   - Email: eya.lorenzana@email.com
   - Class: HIIT
   - Trainer: Coach John
   - Day: Monday
   - Time: 6:00 PM
   - Status: Pending (yellow)
4. Click **"Approve"** button (green)
5. Prompt appears: "Add a note for the member (optional):"
6. Type: `Great choice! See you Monday!`
7. Click OK
8. ✅ Status changes to **"Confirmed"** (green)
9. ✅ See "✓ Approved" text
10. ✅ See note displayed: "Note: Great choice! See you Monday!"

---

### Member App (localhost:5173)

**Step 6: See Confirmation**
1. Go back to member app
2. Already on Booking History page
3. **WAIT 2 SECONDS** (auto-refresh)
4. ✅ Status changes to **"Confirmed"** (green badge)
5. ✅ Green checkmark icon
6. ✅ See admin note in green box:
   ```
   Admin Note:
   Great choice! See you Monday!
   ```

**✅ TEST 1 PASSED!**

---

## 🚫 TEST 2: REJECT FLOW (2 min)

### Member App

**Step 1: Book Another Class**
1. Click "+ Book New Class" button at bottom
2. Select **Yoga** (🧘 icon)
3. Select **Coach Ana**
4. Select **Tuesday**
5. Select **7:00 AM**
6. Click "Confirm Booking"
7. ✅ Success toast
8. Go to Booking History
9. ✅ See Yoga booking with **"Pending"** status

---

### Admin App

**Step 2: Check Dashboard**
1. Go to Dashboard
2. ✅ "Pending Booking Requests: 2" (or 1 if first was already approved)

**Step 3: Reject Booking**
1. Go to Schedule → Class Bookings
2. Find Yoga booking (Eya Lorenzana, Tuesday, 7:00 AM)
3. Click **"Reject"** button (red)
4. Prompt: "Reason for rejection (will be shown to member):"
5. Type: `Trainer unavailable - please choose another time`
6. Click OK
7. ✅ Status changes to **"Rejected"** (red)
8. ✅ See "✗ Rejected" text
9. ✅ See reason: "Reason: Trainer unavailable - please choose another time"

---

### Member App

**Step 4: See Rejection**
1. Go to Booking History
2. **WAIT 2 SECONDS**
3. ✅ Yoga booking moves to "Past" tab
4. Click "Past" tab
5. ✅ See Yoga booking with **"Rejected"** status (red badge)
6. ✅ Red X icon
7. ✅ See rejection reason in red box:
   ```
   Rejection Reason:
   Trainer unavailable - please choose another time
   ```
8. ✅ See "Book Another Class" button

**✅ TEST 2 PASSED!**

---

## ✅ SUCCESS CHECKLIST

After both tests, you should have:

- [ ] Member can book a class
- [ ] Booking saves as "Pending" status
- [ ] Admin Dashboard shows pending count with badge
- [ ] Badge is yellow and animating
- [ ] Clicking badge navigates to Schedule
- [ ] Admin can see booking in Class Bookings tab
- [ ] Admin can approve with optional note
- [ ] Status updates to "Confirmed" in admin
- [ ] Member sees "Confirmed" status (auto-refresh)
- [ ] Member sees admin note in green box
- [ ] Admin can reject with required reason
- [ ] Status updates to "Rejected" in admin
- [ ] Member sees "Rejected" status (auto-refresh)
- [ ] Member sees rejection reason in red box

**If all checked → COMPLETE BOOKING FLOW WORKS! 🎉**

---

## 🔍 WHAT TO LOOK FOR

### Dashboard:
```
┌─────────────────────────────────────┐
│ Quick Stats                         │
├─────────────────────────────────────┤
│ 📅 Pending Booking Requests    [1]  │ ← Yellow pulsing badge
│                                  1  │
└─────────────────────────────────────┘
```

### Admin Schedule → Class Bookings:
```
┌──────────────────────────────────────────────────────────┐
│ Member          Class  Trainer   Schedule      Status    │
├──────────────────────────────────────────────────────────┤
│ Eya Lorenzana   HIIT   Coach     Monday        Pending   │
│ eya@email.com          John      6:00 PM   [Approve][Reject]│
└──────────────────────────────────────────────────────────┘
```

### Member Booking History (Confirmed):
```
┌─────────────────────────────────────┐
│ 🔥 HIIT                             │
│ Coach John                          │
│ Monday, 6:00 PM                     │
│ ✓ Confirmed                         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Admin Note:                     │ │ ← Green box
│ │ Great choice! See you Monday!   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Member Booking History (Rejected):
```
┌─────────────────────────────────────┐
│ 🧘 Yoga                             │
│ Coach Ana                           │
│ Tuesday, 7:00 AM                    │
│ ✗ Rejected                          │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Rejection Reason:               │ │ ← Red box
│ │ Trainer unavailable - please    │ │
│ │ choose another time             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Book Another Class]                │
└─────────────────────────────────────┘
```

---

## 🆘 TROUBLESHOOTING

### Issue: Pending count not showing
**Solution:** Clear localStorage and refresh
```javascript
// Browser console (F12):
localStorage.clear();
location.reload();
```

### Issue: Status not updating
**Solution:** Wait 2 seconds for auto-refresh, or manually refresh page

### Issue: Booking not appearing in admin
**Solution:** Check SharedStorage
```javascript
// Browser console:
console.log(localStorage.getItem('gfitness_bookings'));
```

---

## 🎉 COMPLETION

**Time:** 5 minutes  
**Tests:** 2 (Approve + Reject)  
**Result:** Complete booking workflow verified!

**You're ready to demo this for your defense! 🚀**
