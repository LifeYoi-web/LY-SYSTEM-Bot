import { type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useMe } from './auth';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';

function Guarded({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <p>...</p>;
  if (isError || !data?.authorized) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guarded><Overview /></Guarded>} />
      </Routes>
    </BrowserRouter>
  );
}
