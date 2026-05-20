# ⚡ QUICK START GUIDE

## 🚀 Start the System (2 Commands)

### **Terminal 1 - Member App:**
```bash
cd g-fitness-member
npm run dev
```
**Opens at:** http://localhost:5173

### **Terminal 2 - Admin App:**
```bash
cd g-fitness-admin
npm run dev
```
**Opens at:** http://localhost:5174

---

## 🔑 Demo Credentials

### **Member Login:**
- **Email:** eya.lorenzana@email.com
- **Password:** password123

**OR**

- **Email:** maria@email.com
- **Password:** password123

### **Test Member ID (for QR check-in):**
- GF-2024-001
- GF-2024-002
- GF-2024-003

---

## ✅ Quick Feature Test (2 Minutes)

### **Member App:**
1. Login with eya.lorenzana@email.com / password123
2. See QR code with countdown timer
3. Click refresh button to generate new QR
4. Navigate to different pages

### **Admin App:**
1. Open http://localhost:5174
2. Go to Attendance page
3. Enter GF-2024-001 in QR field
4. Click "Check In with QR"
5. See success notification

---

## 🛠️ Troubleshooting

### **If servers won't start:**
```bash
# Member App
cd g-fitness-member
rm -rf node_modules package-lock.json
npm install
npm run dev

# Admin App
cd g-fitness-admin
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### **If login doesn't work:**
```javascript
// Open browser console and run:
localStorage.clear()
// Then refresh page and try again
```

### **If QR code doesn't show:**
- Check browser console for errors
- Make sure qrcode.react is installed
- Refresh the page

---

## 📁 Important Files

### **Defense Documents:**
- `docs/DEFENSE_READY_SUMMARY.md` - Complete defense guide
- `docs/DEFENSE_GUIDE.md` - Detailed Q&A preparation
- `docs/QUICK_TEST_CHECKLIST.md` - Testing procedures
- `docs/IMPLEMENTATION_STATUS.md` - Feature checklist

### **Security Utilities:**
- `g-fitness-member/src/utils/auth.ts` - Authentication
- `g-fitness-member/src/utils/qrCode.ts` - QR code security
- `g-fitness-member/src/utils/validation.ts` - Input validation
- `g-fitness-member/src/utils/errorHandler.ts` - Error handling

### **Key Pages:**
- `g-fitness-member/src/pages/Login.tsx` - Login with validation
- `g-fitness-member/src/pages/Register.tsx` - Registration with validation
- `g-fitness-member/src/pages/Home.tsx` - QR code with timer
- `g-fitness-admin/src/pages/Attendance.tsx` - Hybrid check-in
- `g-fitness-admin/src/pages/Members.tsx` - Member management

---

## 🎯 Quick Demo Flow

### **For Panelists (5 minutes):**

1. **Member App - Login**
   - Show login page
   - Enter eya.lorenzana@email.com / password123
   - Show validation and success notification

2. **Member App - Home**
   - Show QR code with countdown timer
   - Explain 60-second expiry
   - Click refresh button

3. **Admin App - Dashboard**
   - Show KPIs and charts
   - Explain real-time data

4. **Admin App - Attendance**
   - Enter GF-2024-001
   - Click Check In
   - Show success notification and log

5. **Admin App - Members**
   - Show member list
   - Click Add Member
   - Show CRUD operations

---

## 💡 Key Points to Mention

### **Security:**
- ✅ Time-based QR codes (60-second expiry)
- ✅ Input validation on all forms
- ✅ Centralized error handling
- ✅ Production enhancement notes

### **Features:**
- ✅ Hybrid attendance (QR + manual)
- ✅ Complete member management
- ✅ Payment tracking
- ✅ Real-time analytics
- ✅ Trainer and class scheduling

### **Technology:**
- ✅ React 18 + TypeScript
- ✅ Tailwind CSS
- ✅ Component-based architecture
- ✅ Type-safe code

---

## 📊 System Statistics

- **Total Files:** 115+
- **Lines of Code:** 20,000+
- **Components:** 50+
- **Pages:** 25+
- **Features:** 100% functional

---

## 🎓 Before Defense

### **Must Do:**
- [ ] Test both apps are running
- [ ] Test login works
- [ ] Test QR code shows countdown
- [ ] Test attendance check-in
- [ ] Read DEFENSE_READY_SUMMARY.md
- [ ] Practice demo script

### **Nice to Have:**
- [ ] Take screenshots as backup
- [ ] Record video demo
- [ ] Print documentation
- [ ] Prepare laptop charger

---

## 🚨 Emergency Commands

### **Kill all Node processes:**
```bash
# Windows
taskkill /F /IM node.exe

# Mac/Linux
killall node
```

### **Clear all caches:**
```bash
# Member App
cd g-fitness-member
rm -rf node_modules .vite dist
npm install

# Admin App
cd g-fitness-admin
rm -rf node_modules .vite dist
npm install
```

### **Reset browser:**
```javascript
// In browser console:
localStorage.clear()
sessionStorage.clear()
location.reload()
```

---

## ✅ You're Ready!

**Everything is set up and working!**

Just run the two commands above and you're good to go! 🚀

---

*Quick Start Guide - G-Fitness CORE*
*Last Updated: May 19, 2026*
