# WhatsCRM Frontend

Modern React + TypeScript frontend for WhatsCRM - Multi-channel WhatsApp CRM System.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit **http://localhost:5173**

## ✨ Features

- 🔐 **Authentication** - Login/Signup with JWT
- 💬 **Inbox** - Real-time multi-channel messaging
- 🤖 **Chatbot** - Visual flow builder
- 📢 **Broadcast** - Campaign management
- 📇 **Phonebook** - Contact management
- 👥 **Admin Panel** - User & system management

## 🏗️ Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Material-UI** - UI components
- **React Query** - Server state
- **Zustand** - Client state
- **Socket.IO** - Real-time
- **Axios** - HTTP client
- **React Router** - Routing

## 📁 Project Structure

See **[SETUP.md](./SETUP.md)** for detailed structure.

## 🔧 Configuration

Create `.env` file:

```env
VITE_API_URL=http://localhost:3010
VITE_SOCKET_URL=http://localhost:3010
```

## 📝 Development

### Available Scripts

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run preview` - Preview build
- `npm run lint` - Lint code

### Adding Features

1. Create feature folder in `src/features/`
2. Add route in `src/router.tsx`
3. Create API service in `src/api/`
4. Build UI components

### API Integration

All API calls go through services in `src/api/`:

```typescript
import { inboxAPI } from '../api/inbox.service';

// Usage with React Query
const { data } = useQuery({
  queryKey: ['chats'],
  queryFn: inboxAPI.getChats
});
```

## 🌐 Backend Integration

Backend must be running on port **3010** (or update `.env`).

### CORS Configuration

Ensure backend allows requests from `http://localhost:5173`:

```javascript
// backend: app.js
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
```

## 🐛 Troubleshooting

See **[SETUP.md](./SETUP.md)** for common issues and solutions.

## 📚 Documentation

- [Frontend Architecture Plan](../FRONTEND_ARCHITECTURE_PLAN.md)
- [Setup Guide](./SETUP.md)

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request

## 📄 License

Proprietary - WhatsCRM Project
