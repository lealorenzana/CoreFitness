# G-FITNESS CORE - Testing Guide

## 🧪 Pre-Defense Testing Checklist

Use this guide to verify all features work correctly before your defense.

---

## 🚀 SETUP

### Admin Dashboard
```bash
cd g-fitness-admin
npm install
npm run dev
```
**URL:** http://localhost:5173

### Member App
```bash
cd g-fitness-member
npm install
npm run dev
```
**URL:** http://localhost:5174

---

## ✅ ADMIN DASHBOARD TESTS

### 1. Dashboard Page (/)
- [ ] Page loads without errors
- [ ] All 4 KPI cards display (Total Members, Active, Attendance, Revenue)
- [ ] Revenue chart renders with 6 months of data
- [ ] Weekly attendance bar chart displays
- [ ] Recent activity shows 5 members
- [ ] Quick stats panel shows 4 metrics
- [ ] Gym selector works (switch between gyms)

### 2. Members Page (/members)
- [ ] Member list table displays
- [ ] Stats cards show correct counts (Total, Active, Expiring, Expired)
- [ ] Search bar filters members by name/email
- [ ] Click on a member row → navigates to detail page
- [ ] Member avatars show initials
- [ ] Status badges display correct colors
- [ ] Hover effects work on table rows

### 3. Member Detail Page (/members/:id)
- [ ] Back button returns to members list
- [ ] Member profile card displays all info
- [ ] Membership information section shows plan details
- [ ] Recent attendance shows last 5 visits
- [ ] Payment history table displays transactions
- [ ] Edit and Delete buttons visible
- [ ] Status badges render correctly

### 4. Attendance Page (/attendance)
- [ ] Stats cards show today's metrics
- [ ] QR Code tab is default
- [ ] Manual Check-in tab switches correctly
- [ ] Today's attendance log displays
- [ ] Check-in method badges show (QR Code/Manual)
- [ ] Real-time stats update (simulated)

### 5. Payments Page (/payments)
- [ ] Payment stats cards display (Revenue, Completed, Pending, Failed)
- [ ] "Record Payment" button opens modal
- [ ] Payment table shows all transactions
- [ ] Filter buttons work (All, Completed, Pending, Failed)
- [ ] Payment method icons display
- [ ] Status badges show correct colors

### 6. Record Payment Modal
- [ ] Modal opens when clicking "Record Payment"
- [ ] Member dropdown populates with gym members
- [ ] Amount field accepts numbers only
- [ ] Payment method dropdown works
- [ ] Date picker defaults to today
- [ ] Validation errors show for empty fields
- [ ] Submit button shows loading state
- [ ] New payment appears in table after submit
- [ ] Modal closes after successful submit

### 7. Retention Page (/retention)
- [ ] At-risk members list displays
- [ ] Risk level badges show (High, Medium, Low)
- [ ] 6-month attendance trend chart renders
- [ ] Re-engagement suggestions display
- [ ] Member cards show attendance stats

### 8. Schedule Page (/schedule)
- [ ] Class Schedule tab displays by default
- [ ] Staff Management tab switches correctly
- [ ] Class schedule shows weekly timetable
- [ ] Staff cards display trainer information
- [ ] Specialization badges render

### 9. Chatbot Page (/chatbot)
- [ ] NLP configuration section displays
- [ ] Pre-programmed Q&A pairs show
- [ ] Analytics section renders
- [ ] Popular questions list displays

### 10. Settings Page (/settings)
- [ ] Settings page loads
- [ ] Configuration options display

---

## ✅ MEMBER APP TESTS

### 1. Public Pages (No Login Required)

#### Gym List (/gyms)
- [ ] Page loads without login
- [ ] All 3 gym cards display (G-Fitness, Fitness Regency, Ferrer Fitness)
- [ ] Gym logos and cover photos show
- [ ] "View Details" buttons work
- [ ] Mobile frame displays correctly

#### Gym Detail (/gym/:id)
- [ ] Back button returns to gym list
- [ ] Gym cover photo displays
- [ ] Location and contact info shows
- [ ] Operating hours display
- [ ] Facilities list renders
- [ ] Membership plans show with prices
- [ ] "Become a Member" button links to register

#### Login Page (/)
- [ ] Login form displays
- [ ] Member ID field accepts input
- [ ] Password field masks input
- [ ] "Browse Gyms" link works
- [ ] "Register" link works
- [ ] Demo credentials work: GF-2024-001 / demo123
- [ ] Validation errors show for empty fields
- [ ] Successful login redirects to /member/home

#### Register Page (/register)
- [ ] Step 1: Personal Information form displays
- [ ] All fields validate (name, email, phone, address)
- [ ] "Next" button advances to Step 2
- [ ] Step 2: Plan selection shows 3 plans
- [ ] Plan cards display features and prices
- [ ] "Next" button advances to Step 3
- [ ] Step 3: Payment method selection works
- [ ] "Complete Registration" shows success message
- [ ] Can navigate back through steps

### 2. Protected Pages (Login Required)

#### Home Page (/member/home)
- [ ] Redirects to login if not authenticated
- [ ] G-Fitness CORE logo displays
- [ ] Notification bell shows in header
- [ ] Notification badge shows unread count
- [ ] QR code renders correctly
- [ ] Member card shows name and details
- [ ] 4 stat cards display (Check-ins, This Month, Streak, Level)
- [ ] Quick action buttons render

#### Notifications Component
- [ ] Click bell icon opens notification panel
- [ ] Unread count badge displays
- [ ] Notification list shows all notifications
- [ ] Different notification types have different icons
- [ ] Click notification marks it as read
- [ ] "Mark all read" button works
- [ ] Delete button (X) removes notification
- [ ] Click outside closes panel

#### Profile Page (/member/profile)
- [ ] Profile card displays member info
- [ ] Member avatar shows initials
- [ ] "Edit Profile" button visible
- [ ] Contact information displays (email, phone, address, join date)
- [ ] Menu items render (Account Settings, Notifications, Privacy)
- [ ] Logout button works and redirects to login

#### Edit Profile Page (/member/profile/edit)
- [ ] Back button returns to profile
- [ ] Form pre-fills with current data
- [ ] First name and last name fields work
- [ ] Email field validates email format
- [ ] Phone field validates format (+63 XXX XXX XXXX)
- [ ] Password fields are optional
- [ ] Password validation works (min 6 chars, match confirmation)
- [ ] Validation errors display in red
- [ ] "Save Changes" button shows loading state
- [ ] Success message displays after save
- [ ] Auto-redirects to profile after 2 seconds

#### Progress Page (/member/progress)
- [ ] 4 stat cards display (Weight, Body Fat, Muscle Mass, Workouts)
- [ ] Weekly activity bar chart renders
- [ ] "View Calendar" link visible
- [ ] Achievement badges display
- [ ] Hover on bars shows tooltip with minutes

#### Attendance History Page (/member/attendance-history)
- [ ] Back button returns to progress
- [ ] 4 stat cards show attendance metrics
- [ ] Month selector dropdown works
- [ ] Calendar displays current month
- [ ] Attended days show in green
- [ ] Today shows with border
- [ ] Empty days show in gray
- [ ] Legend displays at bottom
- [ ] Recent check-ins list shows last 5

#### Chatbot Page (/member/chatbot)
- [ ] Chat interface displays
- [ ] Welcome message shows
- [ ] Quick suggestion buttons work
- [ ] Type message and send
- [ ] Typing indicator appears
- [ ] Bot response displays after delay
- [ ] Pre-programmed responses work for:
  - "hours" → gym hours
  - "plans" → membership plans
  - "payment" → payment methods
  - "classes" → class schedule
  - "trainers" → trainer info
  - "facilities" → gym facilities
  - And more...

#### Events Page (/member/events)
- [ ] Event cards display
- [ ] Event details show (name, date, time, location, capacity)
- [ ] "Register" button works
- [ ] "Unregister" button appears after registration
- [ ] Capacity updates after registration
- [ ] Filter buttons work (Upcoming, Registered, Past)

#### Payment History Page (/member/payments)
- [ ] Payment stats cards display
- [ ] Payment history table shows transactions
- [ ] Invoice numbers display
- [ ] Payment methods show
- [ ] Status badges render
- [ ] "Download Invoice" buttons work (simulated)

#### Renew Membership Page (/member/renew)
- [ ] Current membership info displays
- [ ] 3 plan cards show (Basic, Standard, Premium)
- [ ] Plan features list correctly
- [ ] "Select Plan" button works
- [ ] Payment method selection displays
- [ ] "Complete Renewal" shows success
- [ ] Confirmation message displays

#### Membership Page (/member/membership)
- [ ] Membership details display
- [ ] Current plan shows
- [ ] Expiry date visible
- [ ] "Renew" button links to renewal page

#### Workouts Page (/member/workouts)
- [ ] Workout page displays
- [ ] Workout content renders

---

## 🎨 UI/UX TESTS

### Design Consistency
- [ ] Brand colors consistent (Yellow-orange gradient, Purple, Black)
- [ ] Orbitron font used for headings
- [ ] Lucide icons used (NO EMOJIS)
- [ ] Glassmorphism effects on cards
- [ ] Shadows and depth consistent
- [ ] Gradients smooth and professional

### Animations
- [ ] Page transitions smooth
- [ ] Card hover effects work
- [ ] Button hover states animate
- [ ] Modal open/close animations
- [ ] Loading spinners display
- [ ] Framer Motion animations smooth

### Mobile Frame (Member App)
- [ ] iPhone frame displays (375x812px)
- [ ] Notch visible at top
- [ ] Bottom navigation persistent
- [ ] Scrollbar hidden
- [ ] Content fits within frame
- [ ] Touch targets large enough

### Responsive Design
- [ ] Admin dashboard works on desktop
- [ ] Member app works in mobile frame
- [ ] No horizontal scrolling
- [ ] Text readable at all sizes
- [ ] Images scale properly

---

## 🐛 COMMON ISSUES & FIXES

### Issue: "Module not found"
**Fix:** Run `npm install` in the project directory

### Issue: "Port already in use"
**Fix:** Kill the process or change port in vite.config.ts

### Issue: "Page not found"
**Fix:** Check that you're using the correct URL and port

### Issue: "Images not loading"
**Fix:** Ensure logo files are in public folder

### Issue: "Styles not applying"
**Fix:** Check Tailwind config and restart dev server

### Issue: "TypeScript errors"
**Fix:** Check import paths and type definitions

---

## 📊 DEMO SCRIPT FOR DEFENSE

### Part 1: Admin Dashboard (5 minutes)
1. **Dashboard** → "This is the main dashboard showing real-time KPIs and analytics"
2. **Members** → "Here we manage all gym members" → Click member → "Full member profile with attendance and payment history"
3. **Attendance** → "Hybrid check-in system with QR code and manual backup"
4. **Payments** → Click "Record Payment" → Fill form → "Admin can manually record cash payments"
5. **Retention** → "Predictive analytics identify at-risk members"

### Part 2: Member App (5 minutes)
1. **Gym List** → "Public can browse gyms without login"
2. **Register** → "3-step registration process" → Show validation
3. **Login** → Use demo credentials
4. **Home** → "Member's QR code for gym access" → Click notification bell
5. **Profile** → Click "Edit Profile" → "Members can update their information"
6. **Progress** → Click "View Calendar" → "Full attendance history"
7. **Chatbot** → Ask question → "NLP-based assistant"
8. **Events** → Register for event
9. **Renew** → "Complete membership renewal flow"

### Part 3: Q&A (5 minutes)
- Be ready to explain any feature in detail
- Acknowledge limitations (no backend, mock data)
- Discuss future enhancements
- Show code if asked

---

## ✅ FINAL CHECKLIST

Before Defense:
- [ ] Both apps run without errors
- [ ] All pages load correctly
- [ ] All forms validate properly
- [ ] All buttons and links work
- [ ] All animations smooth
- [ ] No console errors
- [ ] Demo credentials work
- [ ] Screenshots/screen recording ready
- [ ] Presentation slides prepared
- [ ] Code comments added
- [ ] README files updated

**You're ready to defend! Good luck! 🎓**
