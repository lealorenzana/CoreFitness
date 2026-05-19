import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  return (
    <div className="flex h-screen bg-dark overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden ml-72">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-dark">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
