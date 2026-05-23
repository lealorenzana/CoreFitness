# Core Fitness

**AI-Assisted Gym Management System with Rule-Based Analytics and NLP-Based Administrative Support**

Capstone Project — University of Occidental Mindoro, Mamburao

---

## Quick Start

```bash
# Admin App (http://localhost:5174)
cd g-fitness-admin && npm install && npm run dev

# Member App (http://localhost:5173)
cd g-fitness-member && npm install && npm run dev
```

---

## Applications

| App | Port | Description |
|-----|------|-------------|
| Admin | 5174 | Desktop dashboard for gym management |
| Member | 5173 | Mobile app for members and trainers |

---

## User Roles

| Role | How to Access |
|------|--------------|
| **Admin** | `localhost:5174/admin/login` → click Login |
| **Member** | `localhost:5173` → Get Started → Select gym → Login → Select Member |
| **Trainer** | `localhost:5173` → Select gym → Login → Select Trainer (credentials from admin) |

---

## RBAC Flow

```
Admin creates trainer → sets email + password → gives to trainer
Trainer: Login → select Trainer role → enter credentials → /trainer/home

Member: Register → select Member role → 3-step form → Pending
Admin approves → Member: Login → select Member role → /member/home
```

---

## Documentation

| File | Description |
|------|-------------|
| [System Documentation](docs/SYSTEM_DOCUMENTATION.md) | Complete system overview — everything about the system |
| [Setup Guide](docs/SETUP_GUIDE.md) | Installation, credentials, troubleshooting, reset |
| [Defense Guide](docs/DEFENSE_GUIDE.md) | Demo flow, talking points, panel Q&A |
| [Project Structure](docs/PROJECT_STRUCTURE.md) | Full file tree with descriptions |

---

## Tech Stack

React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion + Recharts + Lucide React

---

## Trainers

| Name | Specialization |
|------|---------------|
| Cyrelle Joy Duhac | Strength & Conditioning |
| Ana Par Iturralde | HIIT & Cardio |
| Nathanniel Ucol | Boxing & Functional Training |

---

## Core Features

- ✅ QR-based attendance (time-limited codes)
- ✅ Rule-based retention analytics
- ✅ NLP-powered AI chatbot
- ✅ RBAC (Admin / Member / Trainer)
- ✅ 9-tab member progress hub
- ✅ Trainer credential management
- ✅ Pending registration approval flow
- ✅ Multi-gym support (3 locations)
- ✅ Real-time data sync via SharedStorage
