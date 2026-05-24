import { type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useMe } from './auth';
import { Loading } from './components/ui';
import { Layout } from './components/Layout';
import { Landing } from './site/Landing';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Analytics } from './pages/Analytics';
import { Members } from './pages/Members';
import { Cases } from './pages/Cases';
import { AutoMod } from './pages/AutoMod';
import { Logs } from './pages/Logs';
import { Welcome } from './pages/Welcome';
import { Commands } from './pages/Commands';
import { Settings } from './pages/Settings';
import { Leveling } from './pages/Leveling';
import { Roles } from './pages/Roles';
import { Announce } from './pages/Announce';
import { AutoResponder } from './pages/AutoResponder';
import { Scheduled } from './pages/Scheduled';

function Guarded({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <Loading minHeight={400} />;
  if (isError || !data?.authorized) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <Guarded>
              <Layout />
            </Guarded>
          }
        >
          <Route index element={<Overview />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="members" element={<Members />} />
          <Route path="cases" element={<Cases />} />
          <Route path="automod" element={<AutoMod />} />
          <Route path="logs" element={<Logs />} />
          <Route path="leveling" element={<Leveling />} />
          <Route path="roles" element={<Roles />} />
          <Route path="autoresponder" element={<AutoResponder />} />
          <Route path="announce" element={<Announce />} />
          <Route path="scheduled" element={<Scheduled />} />
          <Route path="welcome" element={<Welcome />} />
          <Route path="commands" element={<Commands />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
