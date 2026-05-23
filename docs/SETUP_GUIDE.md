# Core Fitness — Setup Guide

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Modern web browser (Chrome, Edge, Firefox)

---

## Installation

### 1. Project Structure

```
CoreFitness/
├── g-fitness-admin/    (Admin dashboard — port 5174)
├── g-fitness-member/   (Member & Trainer app — port 5173)
├── assets/             (Shared images: trainer photos, logos)
└── docs/               (Documentation)
```

### 2. Install dependencies

```bash
# Admin App
cd g-fitness-admin
npm install

# Member App
cd g-fitness-member
npm install
```

### 3. Start development servers

Open two terminals:

```bash
# Terminal 1 — Admin App
cd g-fitness-admin
npm run dev
# Opens at http://localhost:5174

# Terminal 2 — Member App
cd g-fitness-member
npm run dev
# Opens at http://localhost:5173
```

---

## Login Credentials

### Admin App (`http://localhost:5174/admin/login`)
- Click "Login" — prototype auto-fills credentials
- Credentials: `admin@corefitness.com` / `admin123`

### Member App — Member Role (`http://localhost:5173`)
1. Click "Get Started" on splash screen
2. Browse gyms → select a gym → click "Login"
3. Select **Member** role card
4. Click "Login as Member" — prototype auto-fills credentials
5. Credentials: `eya.lorenzana@email.com` / `password123`

### Member App — Trainer Role (`http://localhost:5173`)
1. Open the app → select a gym → click "Login"
2. Select **Trainer** role card
3. Enter trainer credentials (created by admin in Trainers page)
4. Default trainer credentials:
   - Cyrelle Joy Duhac: `cyrelle@corefitness.com`
   - Ana Par Iturralde: `ana@corefitness.com`
   - Nathanniel Ucol: `nathanniel@corefitness.com`

> **Note:** In the prototype, any credentials work for login. Role selection determines which dashboard loads.

---

## Public Assets

### Admin App (`g-fitness-admin/public/`)
| File | Description |
|------|-------------|
| `core-fitness-logo.png` | Sidebar logo |
| `trainer-duhac.png` | Cyrelle Joy Duhac photo |
| `trainer-ituralde.png` | Ana Par Iturralde photo |
| `trainer-ucol.png` | Nathanniel Ucol photo |

### Member App (`g-fitness-member/public/`)
| File | Description |
|------|-------------|
| `assets/micajoy-fitness.jpg.png` | Splash screen hero image |
| `trainer-duhac.png` | Trainer photo (copied from admin) |
| `trainer-ituralde.png` | Trainer photo (copied from admin) |
| `trainer-ucol.png` | Trainer photo (copied from admin) |
| `eya.png` | Member profile photo |
| `g-fitness-logo.jpg` | G-Fitness gym logo |
| `fitness-regency-logo.jpg` | Fitness Regency logo |
| `ferrer-fitness-logo.png` | Ferrer Fitness logo |

---

## Key URLs

| URL | Description |
|-----|-------------|
| `http://localhost:5174/admin/login` | Admin login page |
| `http://localhost:5174/dashboard` | Admin dashboard |
| `http://localhost:5174/members` | Member management |
| `http://localhost:5174/trainers` | Trainer management |
| `http://localhost:5174/settings` | System settings |
| `http://localhost:5173/` | Member app splash |
| `http://localhost:5173/login` | Member/Trainer login |
| `http://localhost:5173/register` | New member registration |
| `http://localhost:5173/member/home` | Member home |
| `http://localhost:5173/trainer/home` | Trainer dashboard |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Kill the process or change port in `vite.config.ts` |
| Blank page after login | Clear localStorage: `localStorage.clear()` in browser console |
| Trainer photos not showing | Ensure `trainer-*.png` files exist in `g-fitness-member/public/` |
| Role choice not working | Clear `trainerMode` from localStorage: `localStorage.removeItem('trainerMode')` |
| Pending registrations empty | Open Members page → click Pending button (auto-seeds mock data) |
| TypeScript errors | Run `npx tsc --noEmit --skipLibCheck` in each app folder |

---

## Reset / Clear Data

To reset all prototype data:
```javascript
// Run in browser console
localStorage.clear();
location.reload();
```

To reset only specific data:
```javascript
localStorage.removeItem('pending_registrations');  // Clear pending members
localStorage.removeItem('trainer_accounts');        // Clear trainer credentials
localStorage.removeItem('trainerMode');             // Reset role to member
localStorage.removeItem('isLoggedIn');              // Force logout
```

---

## Build for Production

```bash
cd g-fitness-admin
npm run build
# Output in g-fitness-admin/dist/

cd g-fitness-member
npm run build
# Output in g-fitness-member/dist/
```
